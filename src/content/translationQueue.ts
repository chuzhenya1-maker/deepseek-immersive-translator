import { sendExtensionMessage } from '../services/message.ts';
import {
  MESSAGE_TYPES,
  type TranslateBatchPayload,
} from '../types/message.ts';
import type {
  TranslationBatch,
  TranslationBatchResult,
  TranslationBatchTask,
  TranslationErrorCode,
  TranslationNode,
  TranslationProgress,
  TranslationQueueStatus,
  TranslationResultItem,
} from '../types/translation.ts';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAYS = [1_000, 3_000] as const;

const FATAL_ERROR_CODES = new Set<TranslationErrorCode>([
  'MISSING_API_KEY',
  'AUTHENTICATION_ERROR',
  'INSUFFICIENT_BALANCE',
  'INVALID_CONFIGURATION',
]);

type BatchSender = (
  payload: TranslateBatchPayload,
) => Promise<TranslationBatchResult>;

export interface TranslationQueueOptions
  extends Omit<TranslateBatchPayload, 'batchId' | 'items'> {
  concurrency: number;
  maxAttempts?: number;
  retryDelays?: readonly number[];
  onProgress?: (progress: TranslationProgress) => void;
  sendBatch?: BatchSender;
  sleep?: (delay: number) => Promise<void>;
}

function wait(delay: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delay));
}

async function sendBatchThroughBackground(
  payload: TranslateBatchPayload,
): Promise<TranslationBatchResult> {
  const response = await sendExtensionMessage<TranslationBatchResult>({
    type: MESSAGE_TYPES.TRANSLATE_BATCH,
    payload,
  });

  if (!response.ok) {
    return {
      taskId: payload.taskId,
      batchId: payload.batchId,
      translations: [],
      success: false,
      error: response.error,
      errorCode: 'NETWORK_ERROR',
      retryable: true,
    };
  }

  return response.data;
}

function cloneProgress(progress: TranslationProgress): TranslationProgress {
  return { ...progress };
}

function validateSuccessfulResult(
  task: TranslationBatchTask,
  result: TranslationBatchResult,
  taskId: string,
): TranslationResultItem[] | null {
  if (
    result.batchId !== task.id ||
    (result.taskId !== undefined && result.taskId !== taskId) ||
    !result.success
  ) {
    return null;
  }

  const expectedIds = new Set(task.items.map((item) => item.id));
  const translations = new Map<string, TranslationResultItem>();

  for (const item of result.translations) {
    if (!expectedIds.has(item.id)) {
      continue;
    }
    if (
      translations.has(item.id) ||
      typeof item.translation !== 'string' ||
      item.translation.trim().length === 0
    ) {
      return null;
    }
    translations.set(item.id, item);
  }

  if (translations.size !== expectedIds.size) {
    return null;
  }

  return task.items.map((item) => translations.get(item.id)!);
}

export class TranslationQueue {
  private readonly tasks: TranslationBatchTask[];
  private readonly nodesById: Map<string, TranslationNode>;
  private readonly progress: TranslationProgress;
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly retryDelays: readonly number[];
  private readonly sendBatch: BatchSender;
  private readonly sleep: (delay: number) => Promise<void>;
  private readonly requestOptions: Omit<
    TranslateBatchPayload,
    'batchId' | 'items'
  >;
  private readonly onProgress?: (progress: TranslationProgress) => void;
  private nextTaskIndex = 0;
  private fatalError = false;
  private stopRequested = false;
  private pauseWaiters: Array<() => void> = [];
  private stopWaiters: Array<() => void> = [];
  private queueStatus: TranslationQueueStatus = 'idle';

  constructor(
    batches: TranslationBatch[],
    nodes: TranslationNode[],
    options: TranslationQueueOptions,
  ) {
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
      throw new Error('Translation queue concurrency must be at least 1.');
    }

    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error('Translation queue maxAttempts must be at least 1.');
    }

    this.tasks = batches.map((batch) => ({
      ...batch,
      items: batch.items.map((item) => ({ ...item })),
      status: 'pending',
      retryCount: 0,
    }));
    this.nodesById = new Map(nodes.map((node) => [node.id, node]));
    this.concurrency = options.concurrency;
    this.maxAttempts = maxAttempts;
    this.retryDelays = options.retryDelays ?? DEFAULT_RETRY_DELAYS;
    this.sendBatch = options.sendBatch ?? sendBatchThroughBackground;
    this.sleep = options.sleep ?? wait;
    this.onProgress = options.onProgress;
    this.requestOptions = {
      taskId: options.taskId,
      ...(options.sourceLanguage === undefined
        ? {}
        : { sourceLanguage: options.sourceLanguage }),
      targetLanguage: options.targetLanguage,
      translationStyle: options.translationStyle,
      academicMode: options.academicMode,
      preserveEnglishTerms: options.preserveEnglishTerms,
      ...(options.customPrompt === undefined
        ? {}
        : { customPrompt: options.customPrompt }),
    };
    this.progress = {
      totalBatches: this.tasks.length,
      completedBatches: 0,
      failedBatches: 0,
      totalItems: this.tasks.reduce(
        (total, task) => total + task.items.length,
        0,
      ),
      translatedItems: 0,
      failedItems: 0,
    };
  }

  get status(): TranslationQueueStatus {
    return this.queueStatus;
  }

  getProgress(): TranslationProgress {
    return cloneProgress(this.progress);
  }

  getTasks(): TranslationBatchTask[] {
    return this.tasks.map((task) => ({
      ...task,
      items: task.items.map((item) => ({ ...item })),
    }));
  }

  async start(): Promise<TranslationProgress> {
    if (this.queueStatus !== 'idle') {
      throw new Error('Translation queue has already been started.');
    }

    this.queueStatus = 'running';
    this.emitProgress();

    const workerCount = Math.min(this.concurrency, this.tasks.length);
    await Promise.all(
      Array.from({ length: workerCount }, () => this.runWorker()),
    );

    if (!this.stopRequested) {
      this.queueStatus = this.fatalError ? 'error' : 'completed';
    }
    this.emitProgress();
    return this.getProgress();
  }

  pause(): boolean {
    if (this.queueStatus !== 'running' || this.stopRequested) {
      return false;
    }
    this.queueStatus = 'paused';
    return true;
  }

  resume(): boolean {
    if (this.queueStatus !== 'paused' || this.stopRequested) {
      return false;
    }
    this.queueStatus = 'running';
    this.releasePauseWaiters();
    return true;
  }

  stop(): boolean {
    if (
      this.queueStatus === 'completed' ||
      this.queueStatus === 'error' ||
      this.queueStatus === 'stopped'
    ) {
      return false;
    }

    this.stopRequested = true;
    this.queueStatus = 'stopped';
    this.cancelPendingTasksForStop();
    this.releasePauseWaiters();
    for (const resolve of this.stopWaiters.splice(0)) {
      resolve();
    }
    this.emitProgress();
    return true;
  }

  private async runWorker(): Promise<void> {
    while (!this.fatalError && !this.stopRequested) {
      await this.waitUntilRunnable();
      if (this.stopRequested) {
        return;
      }
      const task = this.takeNextTask();
      if (!task) {
        return;
      }
      await this.processTask(task);
    }
  }

  private takeNextTask(): TranslationBatchTask | undefined {
    const task = this.tasks[this.nextTaskIndex];
    this.nextTaskIndex += 1;
    return task;
  }

  private async processTask(task: TranslationBatchTask): Promise<void> {
    task.status = 'processing';
    this.setNodeStatus(task, 'translating');

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      await this.waitUntilRunnable();
      if (this.stopRequested) {
        this.cancelProcessingTask(task);
        return;
      }

      let result: TranslationBatchResult;

      try {
        result = await this.sendBatch({
          ...this.requestOptions,
          batchId: task.id,
          items: task.items,
        });
      } catch {
        result = {
          taskId: this.requestOptions.taskId,
          batchId: task.id,
          translations: [],
          success: false,
          error: '无法连接扩展后台',
          errorCode: 'NETWORK_ERROR',
          retryable: true,
        };
      }

      if (this.stopRequested) {
        this.cancelProcessingTask(task);
        return;
      }

      const validTranslations = validateSuccessfulResult(
        task,
        result,
        this.requestOptions.taskId,
      );
      if (validTranslations) {
        this.completeTask(task, validTranslations);
        return;
      }

      const normalizedResult = result.success
        ? {
            ...result,
            success: false,
            error: 'DeepSeek 返回的翻译项目不完整',
            errorCode: 'MISSING_TRANSLATION' as const,
            retryable: true,
          }
        : result;

      if (this.fatalError) {
        this.failTask(task, '翻译队列因配置或认证错误停止');
        return;
      }

      const fatal =
        normalizedResult.errorCode !== undefined &&
        FATAL_ERROR_CODES.has(normalizedResult.errorCode);

      if (fatal) {
        this.failTask(task, normalizedResult.error ?? '翻译配置无效');
        this.fatalError = true;
        this.cancelPendingTasks(normalizedResult.error ?? '翻译队列已停止');
        return;
      }

      if (normalizedResult.retryable && attempt < this.maxAttempts) {
        task.retryCount += 1;
        const delay =
          this.retryDelays[Math.min(attempt - 1, this.retryDelays.length - 1)] ??
          0;
        await this.waitForRetry(delay);
        continue;
      }

      this.failTask(task, normalizedResult.error ?? '翻译失败');
      return;
    }
  }

  private async waitUntilRunnable(): Promise<void> {
    while (this.queueStatus === 'paused' && !this.stopRequested) {
      await new Promise<void>((resolve) => {
        this.pauseWaiters.push(resolve);
      });
    }
  }

  private async waitForRetry(delay: number): Promise<void> {
    if (delay <= 0 || this.stopRequested) {
      return;
    }
    let stopResolver: (() => void) | undefined;
    const stopped = new Promise<void>((resolve) => {
      stopResolver = resolve;
      this.stopWaiters.push(resolve);
    });
    await Promise.race([
      this.sleep(delay),
      stopped,
    ]);
    const index = stopResolver ? this.stopWaiters.indexOf(stopResolver) : -1;
    if (index >= 0) {
      this.stopWaiters.splice(index, 1);
    }
  }

  private releasePauseWaiters(): void {
    for (const resolve of this.pauseWaiters.splice(0)) {
      resolve();
    }
  }

  private cancelProcessingTask(task: TranslationBatchTask): void {
    task.status = 'cancelled';
    task.error = undefined;
    this.setNodeStatus(task, 'pending');
  }

  private cancelPendingTasksForStop(): void {
    for (const task of this.tasks) {
      if (task.status !== 'pending') {
        continue;
      }
      task.status = 'cancelled';
      task.error = undefined;
      this.setNodeStatus(task, 'pending');
    }
  }

  private completeTask(
    task: TranslationBatchTask,
    translations: TranslationResultItem[],
  ): void {
    const byId = new Map(translations.map((item) => [item.id, item.translation]));
    for (const item of task.items) {
      const node = this.nodesById.get(item.id);
      const translation = byId.get(item.id);
      if (node && translation !== undefined) {
        node.translatedText = translation;
        node.status = 'translated';
      }
    }

    task.status = 'success';
    task.error = undefined;
    this.progress.completedBatches += 1;
    this.progress.translatedItems += task.items.length;
    this.emitProgress();
  }

  private failTask(task: TranslationBatchTask, error: string): void {
    task.status = 'failed';
    task.error = error;
    this.setNodeStatus(task, 'failed');
    this.progress.completedBatches += 1;
    this.progress.failedBatches += 1;
    this.progress.failedItems += task.items.length;
    this.emitProgress();
  }

  private cancelPendingTasks(error: string): void {
    for (const task of this.tasks) {
      if (task.status !== 'pending') {
        continue;
      }
      task.status = 'cancelled';
      task.error = error;
      this.setNodeStatus(task, 'failed');
      this.progress.completedBatches += 1;
      this.progress.failedBatches += 1;
      this.progress.failedItems += task.items.length;
    }
    this.emitProgress();
  }

  private setNodeStatus(
    task: TranslationBatchTask,
    status: TranslationNode['status'],
  ): void {
    for (const item of task.items) {
      const node = this.nodesById.get(item.id);
      if (node) {
        node.status = status;
        if (status === 'failed') {
          node.translatedText = undefined;
        }
      }
    }
  }

  private emitProgress(): void {
    this.onProgress?.(this.getProgress());
  }
}
