import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { TranslationController } from '../src/content/translationController.ts';
import { TranslationQueue } from '../src/content/translationQueue.ts';
import type {
  TranslateBatchPayload,
  TranslationRuntimeConfig,
} from '../src/types/message.ts';
import type {
  TranslationBatchResult,
  TranslationNode,
  TranslationTaskStatus,
} from '../src/types/translation.ts';

interface PendingRequest {
  payload: TranslateBatchPayload;
  resolve: (result: TranslationBatchResult) => void;
}

const CONFIG: TranslationRuntimeConfig = {
  apiConfigured: true,
  targetLanguage: 'zh-CN',
  displayMode: 'bilingual',
  translationStyle: 'general',
  academicMode: false,
  preserveEnglishTerms: false,
  concurrency: 1,
  batching: { maxCharacters: 6_000, maxItems: 1 },
  floatingBall: { enabled: true, size: 48, opacity: 0.9 },
  selectionTranslation: true,
  contextMenuTranslation: true,
  translationCacheEnabled: false,
  autoTranslateDynamicContent: false,
  autoTranslateSites: [],
  excludedSites: [],
};

function createNodes(count: number): {
  document: Document;
  nodes: TranslationNode[];
} {
  const window = new Window();
  Object.assign(globalThis, {
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });
  window.document.write(
    `<!doctype html><html><body><main>${Array.from(
      { length: count },
      (_, index) => `<p id="node-${index}">Paragraph ${index}</p>`,
    ).join('')}</main></body></html>`,
  );
  window.document.close();
  const document = window.document as unknown as Document;
  return {
    document,
    nodes: Array.from({ length: count }, (_, index) => {
      const element = document.querySelector<HTMLElement>(`#node-${index}`)!;
      const id = `node-${index}`;
      element.setAttribute('data-ds-node-id', id);
      return {
        id,
        element,
        originalText: element.textContent ?? '',
        status: 'pending',
      };
    }),
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
  throw new Error('Condition was not reached.');
}

function complete(request: PendingRequest, text = '译文'): void {
  request.resolve({
    taskId: request.payload.taskId,
    batchId: request.payload.batchId,
    success: true,
    translations: request.payload.items.map((item) => ({
      id: item.id,
      translation: `${text}:${item.id}`,
    })),
  });
}

function controlledController(count: number) {
  const { document, nodes } = createNodes(count);
  const pending: PendingRequest[] = [];
  const cancelled: string[] = [];
  let taskNumber = 0;
  const controller = new TranslationController({
    document,
    scan: () => nodes,
    getConfig: async () => CONFIG,
    createTaskId: () => `task-${++taskNumber}`,
    getPageUrl: () => 'https://example.test/article',
    cancelTask: async (taskId) => {
      cancelled.push(taskId);
    },
    saveDisplayMode: async () => undefined,
    createQueue: (batches, queueNodes, options) =>
      new TranslationQueue(batches, queueNodes, {
        ...options,
        sleep: async () => undefined,
        sendBatch: (payload) =>
          new Promise((resolve) => pending.push({ payload, resolve })),
      }),
  });
  return { controller, document, nodes, pending, cancelled };
}

test('controller owns scanning, translating, progress, and completed states', async () => {
  const fixture = controlledController(2);
  const statuses: TranslationTaskStatus[] = [];
  fixture.controller.subscribe((state) => statuses.push(state.status));
  const run = fixture.controller.start();

  await waitFor(() => fixture.pending.length === 1);
  complete(fixture.pending[0]!);
  await waitFor(() => fixture.pending.length === 2);
  complete(fixture.pending[1]!);
  await run;

  const state = fixture.controller.getState();
  assert.equal(statuses.includes('scanning'), true);
  assert.equal(statuses.includes('translating'), true);
  assert.equal(state.status, 'completed');
  assert.equal(state.progress, 1);
  assert.equal(state.translatedItems, 2);
  assert.equal(fixture.document.querySelectorAll('.ds-translation').length, 2);
});

test('duplicate start returns the same run and creates only one task', async () => {
  const fixture = controlledController(1);
  const first = fixture.controller.start();
  const second = fixture.controller.start();
  assert.equal(first, second);

  await waitFor(() => fixture.pending.length === 1);
  complete(fixture.pending[0]!);
  await Promise.all([first, second]);

  assert.equal(fixture.pending.length, 1);
  assert.equal(fixture.controller.getState().taskId, 'task-1');
});

test('pause lets active work finish, resume continues pending batches once', async () => {
  const fixture = controlledController(3);
  const run = fixture.controller.start();
  await waitFor(() => fixture.pending.length === 1);

  assert.equal(fixture.controller.pause(), true);
  assert.equal(fixture.controller.getState().status, 'paused');
  complete(fixture.pending[0]!);
  await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
  assert.equal(fixture.pending.length, 1);
  assert.equal(fixture.controller.getState().translatedItems, 1);

  assert.equal(fixture.controller.resume(), true);
  await waitFor(() => fixture.pending.length === 2);
  complete(fixture.pending[1]!);
  await waitFor(() => fixture.pending.length === 3);
  complete(fixture.pending[2]!);
  await run;

  assert.equal(fixture.controller.getState().status, 'completed');
  assert.equal(fixture.pending.length, 3);
  assert.equal(fixture.controller.resume(), false);
});

test('stop cancels the task, ignores its late response, and isolates a new task', async () => {
  const fixture = controlledController(1);
  const taskA = fixture.controller.start();
  await waitFor(() => fixture.pending.length === 1);
  const requestA = fixture.pending[0]!;

  await fixture.controller.stop();
  assert.equal(fixture.controller.getState().status, 'stopped');
  assert.deepEqual(fixture.cancelled, ['task-1']);

  const taskB = fixture.controller.start();
  await waitFor(() => fixture.pending.length === 2);
  const requestB = fixture.pending[1]!;
  complete(requestA, 'OLD');
  await taskA;
  assert.notEqual(fixture.controller.getState().taskId, 'task-1');

  complete(requestB, 'NEW');
  await taskB;
  assert.equal(fixture.controller.getState().status, 'completed');
  assert.equal(fixture.nodes[0]?.translatedText, 'NEW:node-0');
});

test('restore during translation stops first and prevents late DOM insertion', async () => {
  const fixture = controlledController(1);
  const run = fixture.controller.start();
  await waitFor(() => fixture.pending.length === 1);
  const request = fixture.pending[0]!;

  await fixture.controller.restore();
  assert.equal(fixture.controller.getState().status, 'idle');
  assert.deepEqual(fixture.cancelled, ['task-1']);
  complete(request, 'LATE');
  await run;

  assert.equal(fixture.document.querySelectorAll('.ds-translation').length, 0);
  assert.equal(fixture.controller.getState().status, 'idle');
});

test('missing API key fails before scanning', async () => {
  const { document } = createNodes(1);
  let scans = 0;
  const controller = new TranslationController({
    document,
    scan: () => {
      scans += 1;
      return [];
    },
    getConfig: async () => ({ ...CONFIG, apiConfigured: false }),
    createTaskId: () => 'missing-key-task',
    getPageUrl: () => 'https://example.test',
  });

  await controller.start();
  assert.equal(scans, 0);
  assert.equal(controller.getState().status, 'error');
  assert.equal(controller.getState().error, '请先配置 DeepSeek API Key');
});

test('automatic start reports the missing API key with an auto-site message', async () => {
  const { document } = createNodes(1);
  const controller = new TranslationController({
    document,
    scan: () => [],
    getConfig: async () => ({ ...CONFIG, apiConfigured: false }),
    createTaskId: () => 'auto-missing-key-task',
    getPageUrl: () => 'https://example.test',
  });

  await controller.start('auto');
  assert.equal(controller.getState().status, 'error');
  assert.equal(
    controller.getState().error,
    '配置 API Key 后可自动翻译此网站',
  );
});

test('a partial batch failure completes with failed item counts', async () => {
  const fixture = controlledController(2);
  const run = fixture.controller.start();
  await waitFor(() => fixture.pending.length === 1);
  const first = fixture.pending[0]!;
  first.resolve({
    taskId: first.payload.taskId,
    batchId: first.payload.batchId,
    success: false,
    translations: [],
    error: '单批次失败',
    errorCode: 'UNKNOWN',
    retryable: false,
  });
  await waitFor(() => fixture.pending.length === 2);
  complete(fixture.pending[1]!);
  await run;

  const state = fixture.controller.getState();
  assert.equal(state.status, 'completed');
  assert.equal(state.translatedItems, 1);
  assert.equal(state.failedItems, 1);
  assert.equal(state.currentMessage, '翻译完成，1 段失败');
});

test('cache hits render immediately and only misses enter the API queue', async () => {
  const { document, nodes } = createNodes(10);
  const pending: PendingRequest[] = [];
  const written: string[] = [];
  const controller = new TranslationController({
    document,
    scan: () => nodes,
    getConfig: async () => ({ ...CONFIG, translationCacheEnabled: true }),
    createTaskId: () => 'cache-task',
    getPageUrl: () => 'https://example.test/cache',
    getCached: async () =>
      new Map(
        nodes.slice(0, 7).map((node) => [node.id, `CACHE:${node.id}`]),
      ),
    setCached: async (items) => {
      written.push(...items.map((item) => item.id));
      return true;
    },
    createQueue: (batches, queueNodes, options) =>
      new TranslationQueue(batches, queueNodes, {
        ...options,
        sleep: async () => undefined,
        sendBatch: (payload) =>
          new Promise((resolve) => pending.push({ payload, resolve })),
      }),
  });
  const run = controller.start();
  await waitFor(() => pending.length === 1);
  assert.equal(controller.getState().translatedItems, 7);
  complete(pending[0]!);
  await waitFor(() => pending.length === 2);
  complete(pending[1]!);
  await waitFor(() => pending.length === 3);
  complete(pending[2]!);
  await run;
  assert.equal(pending.length, 3);
  assert.equal(controller.getState().progress, 1);
  assert.deepEqual(written.sort(), nodes.slice(7).map((node) => node.id).sort());
});

test('a fully cached page renders without creating a DeepSeek queue', async () => {
  const { document, nodes } = createNodes(3);
  let queueCreated = false;
  const controller = new TranslationController({
    document,
    scan: () => nodes,
    getConfig: async () => ({ ...CONFIG, translationCacheEnabled: true }),
    createTaskId: () => 'fully-cached',
    getPageUrl: () => 'https://example.test/cache',
    getCached: async () =>
      new Map(nodes.map((node) => [node.id, `CACHE:${node.id}`])),
    createQueue: (...args) => {
      queueCreated = true;
      return new TranslationQueue(...args);
    },
  });
  await controller.start();
  assert.equal(queueCreated, false);
  assert.equal(controller.getState().translatedItems, 3);
  assert.equal(controller.getState().progress, 1);
  assert.equal(document.querySelectorAll('.ds-translation').length, 3);
});

test('dynamic nodes wait while paused and run after the main queue resumes', async () => {
  const fixture = controlledController(2);
  const run = fixture.controller.start();
  await waitFor(() => fixture.pending.length === 1);
  fixture.controller.pause();

  const element = fixture.document.createElement('p');
  element.textContent = 'Dynamic paragraph';
  element.setAttribute('data-ds-node-id', 'dynamic-1');
  fixture.document.body.append(element);
  void fixture.controller.translateIncremental([
    {
      id: 'dynamic-1',
      element,
      originalText: 'Dynamic paragraph',
      status: 'pending',
    },
  ]);
  complete(fixture.pending[0]!);
  await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
  assert.equal(fixture.pending.length, 1);

  fixture.controller.resume();
  await waitFor(() => fixture.pending.length === 2);
  complete(fixture.pending[1]!);
  await waitFor(() => fixture.pending.length === 3);
  complete(fixture.pending[2]!);
  await run;
  assert.equal(fixture.pending.length, 3);
  assert.equal(element.nextElementSibling?.textContent, '译文:dynamic-1');
});

test('stop and restore disable pending dynamic translation for the session', async () => {
  const fixture = controlledController(1);
  const run = fixture.controller.start();
  await waitFor(() => fixture.pending.length === 1);
  const dynamicElement = fixture.document.createElement('p');
  dynamicElement.setAttribute('data-ds-node-id', 'dynamic-stop');
  fixture.document.body.append(dynamicElement);
  const dynamicNode: TranslationNode = {
    id: 'dynamic-stop',
    element: dynamicElement,
    originalText: 'Dynamic stopped paragraph',
    status: 'pending',
  };
  void fixture.controller.translateIncremental([dynamicNode]);
  await fixture.controller.stop();
  complete(fixture.pending[0]!);
  await run;
  await fixture.controller.translateIncremental([dynamicNode]);
  assert.equal(fixture.pending.length, 1);
  assert.equal(fixture.controller.getState().status, 'stopped');

  await fixture.controller.restore();
  await fixture.controller.translateIncremental([dynamicNode]);
  assert.equal(fixture.pending.length, 1);
  assert.equal(fixture.controller.getState().status, 'idle');
});
