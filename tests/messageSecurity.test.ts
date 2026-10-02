import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedRequest, isOptionsSender } from '../src/background/messageSecurity.ts';
import { MESSAGE_TYPES } from '../src/types/message.ts';

test('only the exact own options page can access API settings and test connection', () => {
  const previous = globalThis.chrome;
  globalThis.chrome = { runtime: { id: 'extension-id', getURL: (path: string) => `chrome-extension://extension-id/${path}` } } as typeof chrome;
  try {
    const content = { id: 'extension-id', url: 'https://example.com/' };
    const options = { id: 'extension-id', url: 'chrome-extension://extension-id/options.html' };
    assert.equal(isOptionsSender(options), true);
    assert.equal(isOptionsSender({ ...options, id: 'other' }), false);
    for (const type of [MESSAGE_TYPES.GET_SETTINGS, MESSAGE_TYPES.TEST_API]) {
      assert.equal(isAllowedRequest({ type }, content), false);
      assert.equal(isAllowedRequest({ type }, options), true);
      assert.equal(isAllowedRequest({ type }, { id: 'extension-id', url: 'https://example.com/options.html' }), false);
    }
    assert.equal(isAllowedRequest({ type: MESSAGE_TYPES.UPDATE_SETTINGS, payload: { api: { apiKey: 'dummy' } } }, content), false);
    assert.equal(isAllowedRequest({ type: MESSAGE_TYPES.UPDATE_SETTINGS, payload: { displayMode: 'bilingual' } }, content), true);
    assert.equal(isAllowedRequest({ type: MESSAGE_TYPES.UPDATE_SETTINGS, payload: { floatingBall: { x: 50, y: 80 } } }, content), true);
    assert.equal(isAllowedRequest({ type: MESSAGE_TYPES.UPDATE_SETTINGS, payload: { excludedSites: ['example.com'] } }, content), true);
    assert.equal(isAllowedRequest({ type: MESSAGE_TYPES.GET_TRANSLATION_CONFIG }, content), true);
  } finally { globalThis.chrome = previous; }
});
