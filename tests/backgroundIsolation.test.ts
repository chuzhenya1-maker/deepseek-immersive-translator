import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { getCachedTranslations, setCachedTranslations } from '../src/content/cacheClient.ts';

test('background isolates credentials while content cache and UI updates still work', async () => {
  const previous = globalThis.chrome;
  const store: Record<string, unknown> = {};
  let isolated = false;
  let listener: (message: unknown, sender: chrome.runtime.MessageSender, reply: (value: unknown) => void) => boolean;
  const contentSender = { id: 'extension-id', url: 'https://example.com/' };
  const optionsSender = { id: 'extension-id', url: 'chrome-extension://extension-id/options.html' };
  const ignore = () => undefined;
  globalThis.chrome = {
    runtime: {
      id: 'extension-id', getURL: (path: string) => `chrome-extension://extension-id/${path}`,
      onInstalled: { addListener: ignore }, onStartup: { addListener: ignore },
      onMessage: { addListener: (callback: typeof listener) => { listener = callback; } },
      sendMessage: (message: unknown, reply: (value: unknown) => void) => listener(message, contentSender, reply),
    },
    storage: {
      local: {
        setAccessLevel: async (config: { accessLevel: string }) => { assert.equal(config.accessLevel, 'TRUSTED_CONTEXTS'); isolated = true; },
        get: async (key: string) => { assert.equal(isolated, true); return { [key]: store[key] }; },
        set: async (data: Record<string, unknown>) => { assert.equal(isolated, true); Object.assign(store, data); },
      }, onChanged: { addListener: ignore },
    },
    tabs: { query: async () => [] },
    contextMenus: { remove: (_id: string, callback: () => void) => callback(), create: ignore, onClicked: { addListener: ignore } },
  } as unknown as typeof chrome;
  try {
    const built = await build({ entryPoints: ['src/background/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env.DEV': 'false' } });
    await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
    const request = (message: unknown, sender = contentSender): Promise<{ ok: boolean; data?: unknown }> =>
      new Promise((resolve) => listener(message, sender, (value) => resolve(value as { ok: boolean; data?: unknown })));
    const saved = await request({ type: 'UPDATE_SETTINGS', payload: { api: { apiKey: 'dummy-private-key' } } }, optionsSender);
    assert.equal(saved.ok, true);
    assert.match(JSON.stringify(saved), /dummy-private-key/);
    assert.equal((await request({ type: 'GET_SETTINGS' })).ok, false);
    assert.equal((await request({ type: 'TEST_API' })).ok, false);
    assert.equal((await request({ type: 'UPDATE_SETTINGS', payload: { api: { baseUrl: 'https://attacker.example' } } })).ok, false);
    for (const result of [
      await request({ type: 'GET_TRANSLATION_CONFIG' }),
      await request({ type: 'UPDATE_SETTINGS', payload: { displayMode: 'original-only' } }),
      await request({ type: 'UPDATE_SETTINGS', payload: { floatingBall: { x: 40 } } }),
    ]) {
      assert.equal(result.ok, true);
      assert.doesNotMatch(JSON.stringify(result), /dummy-private-key|apiKey/);
    }
    const context = { targetLanguage: 'zh-CN', translationStyle: 'general' as const, academicMode: false, preserveEnglishTerms: false };
    assert.equal(await setCachedTranslations([{ id: 'one', text: 'Hello world', translation: '你好世界' }], context), true);
    assert.equal((await getCachedTranslations([{ id: 'two', text: 'Hello world' }], context)).get('two'), '你好世界');
    assert.equal(listener!({ type: 'CACHE_WRITE', payload: { items: [{}], context } }, contentSender, () => assert.fail('invalid request must not be handled')), false);
  } finally { globalThis.chrome = previous; }
});
