import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleSelectionContextMenuClick,
  SELECTION_CONTEXT_MENU_ID,
  syncSelectionContextMenu,
} from '../src/background/contextMenu.ts';
import { translateSelectionText } from '../src/background/selectionTranslation.ts';
import { DEFAULT_SETTINGS } from '../src/services/config.ts';
import type { AppSettings } from '../src/types/settings.ts';

function installChrome(settings: AppSettings) {
  const storageData: Record<string, unknown> = {
    settings: structuredClone(settings),
  };
  const menuIds = new Set<string>();
  const tabMessages: unknown[] = [];
  const chromeMock = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        async get(key: string) {
          return { [key]: storageData[key] };
        },
        async set(value: Record<string, unknown>) {
          Object.assign(storageData, value);
        },
        async remove(key: string) {
          delete storageData[key];
        },
      },
    },
    contextMenus: {
      remove(id: string, callback: () => void) {
        menuIds.delete(id);
        callback();
      },
      create(options: { id: string }) {
        menuIds.add(options.id);
        return options.id;
      },
    },
    tabs: {
      async sendMessage(_tabId: number, message: unknown) {
        tabMessages.push(message);
      },
    },
  };
  Object.assign(globalThis, { chrome: chromeMock });
  return { menuIds, tabMessages };
}

function configuredSettings(): AppSettings {
  return {
    ...structuredClone(DEFAULT_SETTINGS),
    api: { ...DEFAULT_SETTINGS.api, apiKey: 'test-key' },
    academicMode: true,
    preserveEnglishTerms: true,
    customPrompt: 'Keep Latin species names.',
  };
}

test('single-text translation reuses prompt builder and response parser', async () => {
  installChrome(configuredSettings());
  let systemPrompt = '';
  let userPrompt = '';
  const result = await translateSelectionText(
    { requestId: 'selection-1', text: 'Paragraph 1\n\nParagraph 2' },
    {
      createClient: () => ({
        translateBatch: async (request) => {
          systemPrompt = request.systemPrompt;
          userPrompt = request.userPrompt;
          return JSON.stringify({
            translations: [
              {
                id: 'selection-item-selection-1',
                translation: '第一段\n\n第二段',
              },
            ],
          });
        },
      }),
    },
  );
  assert.equal(result.translation, '第一段\n\n第二段');
  assert.match(systemPrompt, /Academic mode is enabled/);
  assert.match(systemPrompt, /Keep Latin species names/);
  assert.match(userPrompt, /Paragraph 1\\n\\nParagraph 2/);
});

test('single-text translation retries malformed responses without a queue', async () => {
  installChrome(configuredSettings());
  let calls = 0;
  const delays: number[] = [];
  const result = await translateSelectionText(
    { requestId: 'selection-2', text: 'Text' },
    {
      sleep: async (delay) => {
        delays.push(delay);
      },
      createClient: () => ({
        translateBatch: async () => {
          calls += 1;
          return calls === 1
            ? 'invalid'
            : '{"translations":[{"id":"selection-item-selection-2","translation":"译文"}]}';
        },
      }),
    },
  );
  assert.equal(result.translation, '译文');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1_000]);
});

test('selection translation uses the shared cache on repeated text', async () => {
  installChrome(configuredSettings());
  let clientCalls = 0;
  const createClient = () => ({
    translateBatch: async (request: { userPrompt: string }) => {
      clientCalls += 1;
      const item = (
        JSON.parse(request.userPrompt) as {
          items: Array<{ id: string }>;
        }
      ).items[0]!;
      return JSON.stringify({
        translations: [{ id: item.id, translation: '缓存译文' }],
      });
    },
  });
  await translateSelectionText(
    { requestId: 'cache-a', text: 'Repeated selection' },
    { createClient },
  );
  const second = await translateSelectionText(
    { requestId: 'cache-b', text: 'Repeated selection' },
    { createClient },
  );
  assert.equal(second.translation, '缓存译文');
  assert.equal(clientCalls, 1);
});

test('context menu is idempotent and emits loading then success', async () => {
  const fixture = installChrome(configuredSettings());
  await syncSelectionContextMenu();
  await syncSelectionContextMenu();
  assert.deepEqual([...fixture.menuIds], [SELECTION_CONTEXT_MENU_ID]);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessage = body.messages.find((message) => message.role === 'user');
    const itemId = (
      JSON.parse(userMessage?.content ?? '{}') as {
        items?: Array<{ id: string }>;
      }
    ).items?.[0]?.id;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [{ id: itemId, translation: '上下文译文' }],
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  try {
    await handleSelectionContextMenuClick(
      {
        menuItemId: SELECTION_CONTEXT_MENU_ID,
        selectionText: 'Selected text',
      } as chrome.contextMenus.OnClickData,
      { id: 7 } as chrome.tabs.Tab,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fixture.tabMessages.length, 2);
  assert.equal(
    (fixture.tabMessages[0] as { type: string }).type,
    'SHOW_SELECTION_LOADING',
  );
  assert.equal(
    (fixture.tabMessages[1] as { payload: { status: string } }).payload.status,
    'success',
  );
});

test('context menu on a restricted page stops before making an API request', async () => {
  installChrome(configuredSettings());
  chrome.tabs.sendMessage = async () => {
    throw new Error('Receiving end does not exist');
  };
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('must not run');
  }) as typeof fetch;
  try {
    await handleSelectionContextMenuClick(
      {
        menuItemId: SELECTION_CONTEXT_MENU_ID,
        selectionText: 'Selected text',
      } as chrome.contextMenus.OnClickData,
      { id: 9 } as chrome.tabs.Tab,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 0);
});
