import assert from 'node:assert/strict';
import test from 'node:test';
import { TranslationQueue } from '../src/content/translationQueue.ts';
import type {
  TranslationBatch,
  TranslationBatchResult,
  TranslationErrorCode,
  TranslationNode,
  TranslationProgress,
} from '../src/types/translation.ts';

function makeNode(id: string): TranslationNode {
  return {
    id,
    element: {} as HTMLElement,
    originalText: `Text ${id}`,
    status: 'pending',
  };
}

function makeBatch(id: string): TranslationBatch {
  return {
    id: `batch-${id}`,
    items: [{ id, text: `Text ${id}` }],
    characterCount: id.length + 5,
  };
}

function success(batchId: string, id: string): TranslationBatchResult {
  return {
    batchId,
    success: true,
    translations: [{ id, translation: `译文 ${id}` }],
  };
}

function options(
  sendBatch: (
    payload: Parameters<NonNullable<ConstructorParameters<typeof TranslationQueue>[2]['sendBatch']>>[0],
  ) => Promise<TranslationBatchResult>,
  overrides: Partial<ConstructorParameters<typeof TranslationQueue>[2]> = {},
): ConstructorParameters<typeof TranslationQueue>[2] {
  return {
    taskId: 'test-task',
    targetLanguage: 'zh-CN',
    translationStyle: 'general',
    academicMode: false,
    preserveEnglishTerms: false,
    concurrency: 2,
    sendBatch,
    sleep: async () => undefined,
    ...overrides,
  };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
  throw new Error('Condition was not reached.');
}

test('worker pool never exceeds configured concurrency', async () => {
  const nodes = ['a', 'b', 'c', 'd'].map(makeNode);
  const batches = ['a', 'b', 'c', 'd'].map(makeBatch);
  let active = 0;
  let maximumActive = 0;
  const queue = new TranslationQueue(
    batches,
    nodes,
    options(async (payload) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
      active -= 1;
      return success(payload.batchId, payload.items[0]!.id);
    }),
  );

  await queue.start();
  assert.equal(maximumActive, 2);
  assert.equal(nodes.every((node) => node.status === 'translated'), true);
});

test('retries retryable errors with 1s and 3s delays, then succeeds', async () => {
  const retryableCodes: TranslationErrorCode[] = [
    'RATE_LIMIT_ERROR',
    'SERVER_ERROR',
    'TIMEOUT_ERROR',
    'NETWORK_ERROR',
    'INVALID_RESPONSE',
    'MISSING_TRANSLATION',
  ];

  for (const errorCode of retryableCodes) {
    const node = makeNode(errorCode);
    const delays: number[] = [];
    let attempts = 0;
    const queue = new TranslationQueue(
      [makeBatch(errorCode)],
      [node],
      options(
        async (payload) => {
          attempts += 1;
          if (attempts < 3) {
            return {
              batchId: payload.batchId,
              translations: [],
              success: false,
              error: 'temporary failure',
              errorCode,
              retryable: true,
            };
          }
          return success(payload.batchId, payload.items[0]!.id);
        },
        { sleep: async (delay) => void delays.push(delay) },
      ),
    );

    await queue.start();
    assert.equal(attempts, 3, errorCode);
    assert.deepEqual(delays, [1_000, 3_000], errorCode);
    assert.equal(queue.getTasks()[0]?.retryCount, 2, errorCode);
  }
});

test('isolates a failed batch and continues remaining work', async () => {
  const nodes = ['a', 'b'].map(makeNode);
  const queue = new TranslationQueue(
    ['a', 'b'].map(makeBatch),
    nodes,
    options(async (payload) => {
      if (payload.items[0]?.id === 'a') {
        return {
          batchId: payload.batchId,
          translations: [],
          success: false,
          error: 'bad response',
          errorCode: 'UNKNOWN',
          retryable: false,
        };
      }
      return success(payload.batchId, 'b');
    }),
  );

  const progress = await queue.start();
  assert.equal(nodes[0]?.status, 'failed');
  assert.equal(nodes[1]?.status, 'translated');
  assert.deepEqual(progress, {
    totalBatches: 2,
    completedBatches: 2,
    failedBatches: 1,
    totalItems: 2,
    translatedItems: 1,
    failedItems: 1,
  });
});

test('updates nodes by ID when returned translations are reordered', async () => {
  const nodes = ['a', 'b'].map(makeNode);
  const batch: TranslationBatch = {
    id: 'batch-ab',
    items: [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
    ],
    characterCount: 9,
  };
  const queue = new TranslationQueue(
    [batch],
    nodes,
    options(async () => ({
      batchId: 'batch-ab',
      success: true,
      translations: [
        { id: 'b', translation: '乙' },
        { id: 'a', translation: '甲' },
        { id: 'unknown', translation: '忽略' },
      ],
    })),
  );

  await queue.start();
  assert.equal(nodes[0]?.translatedText, '甲');
  assert.equal(nodes[1]?.translatedText, '乙');
});

test('emits detached progress snapshots', async () => {
  const snapshots: TranslationProgress[] = [];
  const queue = new TranslationQueue(
    [makeBatch('a')],
    [makeNode('a')],
    options(async (payload) => success(payload.batchId, 'a'), {
      onProgress: (progress) => snapshots.push(progress),
    }),
  );

  await queue.start();
  snapshots[0]!.completedBatches = 99;
  assert.equal(queue.getProgress().completedBatches, 1);
  assert.equal(snapshots.some((item) => item.completedBatches === 1), true);
});

test('prevents duplicate queue starts', async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new TranslationQueue(
    [makeBatch('a')],
    [makeNode('a')],
    options(async (payload) => {
      await gate;
      return success(payload.batchId, 'a');
    }),
  );

  const firstStart = queue.start();
  await assert.rejects(queue.start(), /already been started/);
  release?.();
  await firstStart;
});

test('authentication failure is not retried and stops pending batches', async () => {
  const nodes = ['a', 'b'].map(makeNode);
  let attempts = 0;
  const queue = new TranslationQueue(
    ['a', 'b'].map(makeBatch),
    nodes,
    options(
      async (payload) => {
        attempts += 1;
        return {
          batchId: payload.batchId,
          translations: [],
          success: false,
          error: 'API Key 无效或无权限',
          errorCode: 'AUTHENTICATION_ERROR',
          retryable: false,
        };
      },
      { concurrency: 1 },
    ),
  );

  const progress = await queue.start();
  assert.equal(attempts, 1);
  assert.equal(queue.status, 'error');
  assert.deepEqual(
    queue.getTasks().map((task) => task.status),
    ['failed', 'cancelled'],
  );
  assert.equal(progress.failedItems, 2);
});

test('a success result with a missing ID is retried and ultimately fails safely', async () => {
  const nodes = ['a', 'b'].map(makeNode);
  const batch: TranslationBatch = {
    id: 'batch-ab',
    items: [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
    ],
    characterCount: 9,
  };
  let attempts = 0;
  const queue = new TranslationQueue(
    [batch],
    nodes,
    options(async () => {
      attempts += 1;
      return {
        batchId: 'batch-ab',
        success: true,
        translations: [{ id: 'a', translation: '甲' }],
      };
    }),
  );

  await queue.start();
  assert.equal(attempts, 3);
  assert.equal(nodes.every((node) => node.status === 'failed'), true);
  assert.equal(nodes.every((node) => node.translatedText === undefined), true);
});

test('pause allows active workers to finish and resume continues without duplicates', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const pending: Array<{
    batchId: string;
    id: string;
    resolve: (result: TranslationBatchResult) => void;
  }> = [];
  const queue = new TranslationQueue(
    ids.map(makeBatch),
    ids.map(makeNode),
    options(
      (payload) =>
        new Promise((resolve) =>
          pending.push({
            batchId: payload.batchId,
            id: payload.items[0]!.id,
            resolve,
          }),
        ),
      { concurrency: 2 },
    ),
  );
  const run = queue.start();
  await waitUntil(() => pending.length === 2);
  assert.equal(queue.pause(), true);

  pending[0]!.resolve(success(pending[0]!.batchId, pending[0]!.id));
  pending[1]!.resolve(success(pending[1]!.batchId, pending[1]!.id));
  await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
  assert.equal(pending.length, 2);
  assert.equal(queue.status, 'paused');

  assert.equal(queue.resume(), true);
  for (let index = 2; index < ids.length; index += 1) {
    await waitUntil(() => pending.length > index);
    pending[index]!.resolve(
      success(pending[index]!.batchId, pending[index]!.id),
    );
  }
  await run;

  assert.equal(queue.status, 'completed');
  assert.equal(pending.length, 6);
  assert.equal(queue.getProgress().translatedItems, 6);
});

test('stop clears pending work and ignores active late successes without retrying', async () => {
  const ids = Array.from({ length: 10 }, (_, index) => String(index));
  const pending: Array<{
    batchId: string;
    id: string;
    resolve: (result: TranslationBatchResult) => void;
  }> = [];
  const nodes = ids.map(makeNode);
  const queue = new TranslationQueue(
    ids.map(makeBatch),
    nodes,
    options(
      (payload) =>
        new Promise((resolve) =>
          pending.push({
            batchId: payload.batchId,
            id: payload.items[0]!.id,
            resolve,
          }),
        ),
      { concurrency: 2 },
    ),
  );
  const run = queue.start();
  await waitUntil(() => pending.length === 2);
  assert.equal(queue.stop(), true);

  for (const request of pending) {
    request.resolve(success(request.batchId, request.id));
  }
  await run;

  assert.equal(queue.status, 'stopped');
  assert.equal(pending.length, 2);
  assert.equal(queue.getProgress().translatedItems, 0);
  assert.equal(queue.getProgress().failedItems, 0);
  assert.equal(nodes.every((node) => node.status === 'pending'), true);
  assert.equal(
    queue.getTasks().every((task) => task.status === 'cancelled'),
    true,
  );
});
