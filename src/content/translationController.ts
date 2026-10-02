import { scanDocumentWithStats } from './domScanner.ts';
import { TranslationRenderer } from './renderer.ts';
import { createBatches } from './textBatcher.ts';
import {
  TranslationQueue,
  type TranslationQueueOptions,
} from './translationQueue.ts';
import { sendExtensionMessage } from '../services/message.ts';
import { getCachedTranslations, setCachedTranslations } from './cacheClient.ts';
import {
  type CacheLookupItem,
  type CacheWriteItem,
  type TranslationCacheContext,
} from '../services/translationCache.ts';
import {
  MESSAGE_TYPES,
  type TranslationRuntimeConfig,
} from '../types/message.ts';
import type { DisplayMode } from '../types/settings.ts';
import type {
  TranslationBatch,
  TranslationNode,
  TranslationProgress,
  TranslationStateListener,
  TranslationTaskState,
} from '../types/translation.ts';

type QueueFactory = (
  batches: TranslationBatch[],
  nodes: TranslationNode[],
  options: TranslationQueueOptions,
) => TranslationQueue;

type CacheReader = (
  items: readonly CacheLookupItem[],
  context: TranslationCacheContext,
) => Promise<Map<string, string>>;
type CacheWriter = (
  items: readonly CacheWriteItem[],
  context: TranslationCacheContext,
) => Promise<boolean>;

export interface TranslationControllerDependencies {
  document?: Document;
  renderer?: TranslationRenderer;
  scan?: () => TranslationNode[];
  createBatches?: typeof createBatches;
  createQueue?: QueueFactory;
  getConfig?: () => Promise<TranslationRuntimeConfig>;
  cancelTask?: (taskId: string) => Promise<void>;
  saveDisplayMode?: (mode: DisplayMode) => Promise<void>;
  createTaskId?: () => string;
  getPageUrl?: () => string;
  getCached?: CacheReader;
  setCached?: CacheWriter;
}

const EMPTY_PROGRESS: TranslationProgress = {
  totalBatches: 0,
  completedBatches: 0,
  failedBatches: 0,
  totalItems: 0,
  translatedItems: 0,
  failedItems: 0,
};

function initialState(): TranslationTaskState {
  return {
    status: 'idle',
    ...EMPTY_PROGRESS,
    progress: 0,
    currentMessage: '准备就绪',
  };
}

async function getRuntimeConfig(): Promise<TranslationRuntimeConfig> {
  const response = await sendExtensionMessage<TranslationRuntimeConfig>({
    type: MESSAGE_TYPES.GET_TRANSLATION_CONFIG,
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

async function cancelBackgroundTask(taskId: string): Promise<void> {
  const response = await sendExtensionMessage<{ cancelledRequests: number }>({
    type: MESSAGE_TYPES.CANCEL_TRANSLATION_TASK,
    payload: { taskId },
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
}

async function persistDisplayMode(mode: DisplayMode): Promise<void> {
  const response = await sendExtensionMessage<unknown>({
    type: MESSAGE_TYPES.UPDATE_SETTINGS,
    payload: { displayMode: mode },
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
}

function calculateProgress(progress: TranslationProgress): number {
  if (progress.totalItems === 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, progress.translatedItems / progress.totalItems));
}

export class TranslationController {
  private readonly renderer: TranslationRenderer;
  private readonly scan: () => TranslationNode[];
  private readonly batch: typeof createBatches;
  private readonly createQueue: QueueFactory;
  private readonly getConfig: () => Promise<TranslationRuntimeConfig>;
  private readonly cancelTask: (taskId: string) => Promise<void>;
  private readonly saveDisplayMode: (mode: DisplayMode) => Promise<void>;
  private readonly createTaskId: () => string;
  private readonly getPageUrl: () => string;
  private readonly getCached: CacheReader;
  private readonly setCached: CacheWriter;
  private readonly listeners = new Set<TranslationStateListener>();
  private state: TranslationTaskState = initialState();
  private activeTaskId: string | undefined;
  private activePageUrl = '';
  private activeQueue: TranslationQueue | undefined;
  private activeNodes: TranslationNode[] = [];
  private activeRun: Promise<void> | undefined;
  private readonly pendingDynamicNodes = new Map<string, TranslationNode>();
  private dynamicSessionActive = false;
  private incrementalRun: Promise<void> | undefined;

  constructor(dependencies: TranslationControllerDependencies = {}) {
    const targetDocument = dependencies.document ?? document;
    this.renderer =
      dependencies.renderer ?? new TranslationRenderer({ document: targetDocument });
    this.scan =
      dependencies.scan ?? (() => scanDocumentWithStats(targetDocument).nodes);
    this.batch = dependencies.createBatches ?? createBatches;
    this.createQueue =
      dependencies.createQueue ??
      ((batches, nodes, options) =>
        new TranslationQueue(batches, nodes, options));
    this.getConfig = dependencies.getConfig ?? getRuntimeConfig;
    this.cancelTask = dependencies.cancelTask ?? cancelBackgroundTask;
    this.saveDisplayMode = dependencies.saveDisplayMode ?? persistDisplayMode;
    this.createTaskId =
      dependencies.createTaskId ?? (() => `ds-task-${crypto.randomUUID()}`);
    this.getPageUrl = dependencies.getPageUrl ?? (() => location.href);
    this.getCached = dependencies.getCached ?? getCachedTranslations;
    this.setCached = dependencies.setCached ?? setCachedTranslations;
  }

  getState(): TranslationTaskState {
    return { ...this.state };
  }

  subscribe(listener: TranslationStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(origin: 'manual' | 'auto' = 'manual'): Promise<void> {
    if (
      this.state.status === 'scanning' ||
      this.state.status === 'translating' ||
      this.state.status === 'paused' ||
      this.state.status === 'stopping'
    ) {
      return this.activeRun ?? Promise.resolve();
    }

    const taskId = this.createTaskId();
    this.dynamicSessionActive = true;
    if (this.state.status === 'completed') {
      this.renderer.restoreOriginal();
    }
    this.activeTaskId = taskId;
    this.activePageUrl = this.getPageUrl();
    this.state = {
      status: 'scanning',
      taskId,
      ...EMPTY_PROGRESS,
      progress: 0,
      currentMessage: '正在准备翻译…',
    };
    this.emit();
    const run = this.runTask(taskId, origin);
    this.activeRun = run;
    void run.finally(() => {
      if (this.activeTaskId === taskId) {
        this.activeRun = undefined;
      }
    });
    return run;
  }

  pause(): boolean {
    if (this.state.status !== 'translating' || !this.activeQueue?.pause()) {
      return false;
    }
    this.updateState({
      status: 'paused',
      currentMessage: '翻译已暂停',
    });
    return true;
  }

  resume(): boolean {
    if (this.state.status !== 'paused' || !this.activeQueue?.resume()) {
      return false;
    }
    this.updateState({
      status: 'translating',
      currentMessage: '继续翻译',
    });
    return true;
  }

  async stop(): Promise<void> {
    if (
      this.state.status !== 'scanning' &&
      this.state.status !== 'translating' &&
      this.state.status !== 'paused'
    ) {
      return;
    }

    const taskId = this.activeTaskId;
    this.updateState({ status: 'stopping', currentMessage: '正在停止…' });
    this.activeQueue?.stop();
    this.activeTaskId = undefined;
    this.dynamicSessionActive = false;
    this.pendingDynamicNodes.clear();

    if (taskId) {
      try {
        await this.cancelTask(taskId);
      } catch {
        // Queue state still prevents new work; cancellation failure is non-fatal here.
      }
    }

    if (
      this.activeTaskId === undefined &&
      this.getState().status === 'stopping'
    ) {
      this.updateState({ status: 'stopped', currentMessage: '翻译已停止' });
    }
  }

  async restore(): Promise<void> {
    if (
      this.state.status === 'scanning' ||
      this.state.status === 'translating' ||
      this.state.status === 'paused'
    ) {
      await this.stop();
    }

    this.renderer.restoreOriginal();
    this.activeQueue = undefined;
    this.activeNodes = [];
    this.activeTaskId = undefined;
    this.activeRun = undefined;
    this.incrementalRun = undefined;
    this.dynamicSessionActive = false;
    this.pendingDynamicNodes.clear();
    this.state = initialState();
    this.emit();
  }

  async setDisplayMode(mode: DisplayMode): Promise<void> {
    this.renderer.setDisplayMode(mode);
    await this.saveDisplayMode(mode);
  }

  translateIncremental(nodes: readonly TranslationNode[]): Promise<void> {
    if (!this.dynamicSessionActive) {
      return Promise.resolve();
    }
    for (const node of nodes) {
      if (
        !node.element.hasAttribute('data-ds-rendered') &&
        !this.pendingDynamicNodes.has(node.id)
      ) {
        this.pendingDynamicNodes.set(node.id, node);
      }
    }
    if (
      this.state.status === 'scanning' ||
      this.state.status === 'translating' ||
      this.state.status === 'paused' ||
      this.state.status === 'stopping'
    ) {
      return Promise.resolve();
    }
    return this.flushDynamicNodes();
  }

  async resetForNavigation(): Promise<void> {
    await this.stop();
    this.renderer.restoreOriginal();
    this.activeQueue = undefined;
    this.activeNodes = [];
    this.activeTaskId = undefined;
    this.activeRun = undefined;
    this.incrementalRun = undefined;
    this.dynamicSessionActive = false;
    this.pendingDynamicNodes.clear();
    this.state = initialState();
    this.emit();
  }

  private async runTask(
    taskId: string,
    origin: 'manual' | 'auto',
  ): Promise<void> {
    try {
      const config = await this.getConfig();
      if (!this.isActiveTask(taskId)) {
        return;
      }
      if (!config.apiConfigured) {
        const message =
          origin === 'auto'
            ? '配置 API Key 后可自动翻译此网站'
            : '请先配置 DeepSeek API Key';
        this.updateState({
          status: 'error',
          taskId,
          error: message,
          currentMessage: message,
        });
        return;
      }

      this.renderer.setTargetLanguage(config.targetLanguage);
      this.renderer.setDisplayMode(config.displayMode);
      this.state = {
        status: 'scanning',
        taskId,
        ...EMPTY_PROGRESS,
        progress: 0,
        currentMessage: '正在分析网页…',
      };
      this.emit();

      const nodes = this.scan();
      if (!this.isActiveTask(taskId)) {
        return;
      }
      this.activeNodes = nodes;

      const cacheContext = this.getCacheContext(config);
      const cached = config.translationCacheEnabled
        ? await this.getCached(
            nodes.map((node) => ({ id: node.id, text: node.originalText })),
            cacheContext,
          ).catch(() => new Map<string, string>())
        : new Map<string, string>();
      for (const node of nodes) {
        const translation = cached.get(node.id);
        if (translation) {
          node.translatedText = translation;
          node.status = 'translated';
        }
      }
      this.renderer.render(nodes);
      const misses = nodes.filter((node) => node.status !== 'translated');
      const cacheHits = nodes.length - misses.length;
      const batches = this.batch(misses, config.batching);

      if (nodes.length === 0) {
        this.updateState({
          status: 'completed',
          totalItems: nodes.length,
          currentMessage: '当前页面未检测到可翻译正文',
        });
        return;
      }

      if (misses.length === 0) {
        this.updateState({
          status: 'completed',
          totalItems: nodes.length,
          translatedItems: nodes.length,
          totalBatches: 0,
          completedBatches: 0,
          progress: 1,
          currentMessage: '翻译完成（全部来自缓存）',
        });
        await this.flushDynamicNodes();
        return;
      }

      const queue = this.createQueue(batches, nodes, {
        taskId,
        targetLanguage: config.targetLanguage,
        translationStyle: config.translationStyle,
        academicMode: config.academicMode,
        preserveEnglishTerms: config.preserveEnglishTerms,
        ...(config.customPrompt === undefined
          ? {}
          : { customPrompt: config.customPrompt }),
        concurrency: config.concurrency,
        onProgress: (progress) =>
          this.handleProgress(taskId, progress, cacheHits, nodes.length),
      });
      this.activeQueue = queue;
      this.updateState({
        status: 'translating',
        taskId,
        totalItems: nodes.length,
        translatedItems: cacheHits,
        totalBatches: batches.length,
        progress: nodes.length === 0 ? 0 : cacheHits / nodes.length,
        currentMessage: `正在翻译 ${nodes.length} 段文本`,
      });

      const progress = await queue.start();
      if (!this.isActiveTask(taskId) || this.state.status === 'stopped') {
        return;
      }
      this.renderer.render(nodes);
      if (config.translationCacheEnabled) {
        await this.setCached(
          misses
            .filter(
              (node): node is TranslationNode & { translatedText: string } =>
                node.status === 'translated' && Boolean(node.translatedText?.trim()),
            )
            .map((node) => ({
              id: node.id,
              text: node.originalText,
              translation: node.translatedText,
            })),
          cacheContext,
        ).catch(() => false);
      }

      const combinedProgress = {
        ...progress,
        totalItems: nodes.length,
        translatedItems: cacheHits + progress.translatedItems,
      };

      if (combinedProgress.translatedItems === 0 && progress.failedItems > 0) {
        const taskError = queue.getTasks().find((task) => task.error)?.error;
        this.updateState({
          status: 'error',
          error: taskError ?? '网页翻译失败',
          currentMessage: taskError ?? '网页翻译失败',
        });
      } else {
        this.updateState({
          status: 'completed',
          ...combinedProgress,
          progress: calculateProgress(combinedProgress),
          currentMessage:
            progress.failedItems > 0
              ? `翻译完成，${progress.failedItems} 段失败`
              : '翻译完成',
        });
        await this.flushDynamicNodes();
      }
    } catch (error: unknown) {
      if (!this.isActiveTask(taskId) || this.state.status === 'stopped') {
        return;
      }
      const message = error instanceof Error ? error.message : '网页翻译失败';
      this.updateState({
        status: 'error',
        error: message,
        currentMessage: message,
      });
    }
  }

  private flushDynamicNodes(): Promise<void> {
    if (
      !this.dynamicSessionActive ||
      this.pendingDynamicNodes.size === 0 ||
      this.incrementalRun ||
      this.state.status !== 'completed'
    ) {
      return this.incrementalRun ?? Promise.resolve();
    }
    const nodes = [...this.pendingDynamicNodes.values()];
    this.pendingDynamicNodes.clear();
    const taskId = this.createTaskId();
    this.activeTaskId = taskId;
    this.activePageUrl = this.getPageUrl();
    const run = this.runIncrementalTask(taskId, nodes).finally(() => {
      if (this.activeTaskId === taskId) {
        this.incrementalRun = undefined;
      }
      if (
        this.dynamicSessionActive &&
        this.state.status === 'completed' &&
        this.pendingDynamicNodes.size > 0
      ) {
        void this.flushDynamicNodes();
      }
    });
    this.incrementalRun = run;
    return run;
  }

  private async runIncrementalTask(
    taskId: string,
    nodes: TranslationNode[],
  ): Promise<void> {
    try {
      const config = await this.getConfig();
      if (!this.isActiveTask(taskId) || !this.dynamicSessionActive) {
        return;
      }
      const cacheContext = this.getCacheContext(config);
      const cached = config.translationCacheEnabled
        ? await this.getCached(
            nodes.map((node) => ({ id: node.id, text: node.originalText })),
            cacheContext,
          ).catch(() => new Map<string, string>())
        : new Map<string, string>();
      for (const node of nodes) {
        const translation = cached.get(node.id);
        if (translation) {
          node.translatedText = translation;
          node.status = 'translated';
        }
      }
      this.activeNodes = nodes;
      this.renderer.render(nodes);
      const misses = nodes.filter((node) => node.status !== 'translated');
      const cacheHits = nodes.length - misses.length;
      const batches = this.batch(misses, config.batching);
      if (misses.length === 0) {
        this.updateState({
          status: 'completed',
          taskId,
          totalItems: nodes.length,
          translatedItems: nodes.length,
          failedItems: 0,
          totalBatches: 0,
          completedBatches: 0,
          failedBatches: 0,
          progress: 1,
          currentMessage: `已翻译 ${nodes.length} 段动态内容（缓存）`,
        });
        return;
      }

      const queue = this.createQueue(batches, misses, {
        taskId,
        targetLanguage: config.targetLanguage,
        translationStyle: config.translationStyle,
        academicMode: config.academicMode,
        preserveEnglishTerms: config.preserveEnglishTerms,
        ...(config.customPrompt === undefined
          ? {}
          : { customPrompt: config.customPrompt }),
        concurrency: config.concurrency,
        onProgress: (progress) =>
          this.handleProgress(taskId, progress, cacheHits, nodes.length),
      });
      this.activeQueue = queue;
      this.updateState({
        status: 'translating',
        taskId,
        totalItems: nodes.length,
        translatedItems: cacheHits,
        failedItems: 0,
        totalBatches: batches.length,
        completedBatches: 0,
        failedBatches: 0,
        progress: cacheHits / nodes.length,
        currentMessage: `正在翻译 ${nodes.length} 段动态内容`,
      });
      const progress = await queue.start();
      if (!this.isActiveTask(taskId) || !this.dynamicSessionActive) {
        return;
      }
      this.renderer.render(nodes);
      if (config.translationCacheEnabled) {
        await this.setCached(
          misses
            .filter(
              (node): node is TranslationNode & { translatedText: string } =>
                node.status === 'translated' && Boolean(node.translatedText?.trim()),
            )
            .map((node) => ({
              id: node.id,
              text: node.originalText,
              translation: node.translatedText,
            })),
          cacheContext,
        ).catch(() => false);
      }
      const combined = {
        ...progress,
        totalItems: nodes.length,
        translatedItems: cacheHits + progress.translatedItems,
      };
      this.updateState({
        status:
          combined.translatedItems === 0 && combined.failedItems > 0
            ? 'error'
            : 'completed',
        ...combined,
        progress: calculateProgress(combined),
        currentMessage:
          combined.failedItems > 0
            ? `动态内容翻译完成，${combined.failedItems} 段失败`
            : '动态内容翻译完成',
      });
    } catch (error: unknown) {
      if (!this.isActiveTask(taskId)) {
        return;
      }
      const message = error instanceof Error ? error.message : '动态内容翻译失败';
      this.updateState({ status: 'error', error: message, currentMessage: message });
    }
  }

  private handleProgress(
    taskId: string,
    progress: TranslationProgress,
    cacheHits = 0,
    totalItems = progress.totalItems,
  ): void {
    if (
      !this.isActiveTask(taskId) ||
      this.state.status === 'stopping' ||
      this.state.status === 'stopped'
    ) {
      return;
    }
    this.renderer.render(this.activeNodes);
    const combinedProgress = {
      ...progress,
      totalItems,
      translatedItems: cacheHits + progress.translatedItems,
    };
    this.updateState({
      ...combinedProgress,
      progress: calculateProgress(combinedProgress),
    });
  }

  private getCacheContext(
    config: TranslationRuntimeConfig,
  ): TranslationCacheContext {
    return {
      targetLanguage: config.targetLanguage,
      translationStyle: config.translationStyle,
      academicMode: config.academicMode,
      preserveEnglishTerms: config.preserveEnglishTerms,
      ...(config.customPrompt === undefined
        ? {}
        : { customPrompt: config.customPrompt }),
    };
  }

  private isActiveTask(taskId: string): boolean {
    if (this.activeTaskId !== taskId) {
      return false;
    }
    if (this.getPageUrl() !== this.activePageUrl) {
      void this.stop();
      return false;
    }
    return true;
  }

  private updateState(patch: Partial<TranslationTaskState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
