import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SETTINGS } from '../src/services/config.ts';
import { mergeSettings } from '../src/services/storage.ts';

test('old settings receive every newer default without losing valid values', () => {
  const settings = mergeSettings({
    targetLanguage: 'ja',
    api: { apiKey: 'preserve-me' },
  });
  assert.equal(settings.targetLanguage, 'ja');
  assert.equal(settings.api.apiKey, 'preserve-me');
  assert.equal(settings.translationCacheEnabled, true);
  assert.equal(settings.batching.maxCharacters, 6_000);
  assert.deepEqual(settings.autoTranslateSites, []);
});

test('corrupted settings fields fall back to safe defaults', () => {
  const settings = mergeSettings({
    targetLanguage: '',
    displayMode: 'broken',
    translationStyle: 'broken',
    api: { timeout: -10, concurrency: 999, temperature: Number.NaN },
    batching: { maxCharacters: 0, maxItems: 1_000 },
    floatingBall: { size: -1, opacity: 9, x: 'bad' },
    autoTranslateSites: ['example.com', 42, 'example.com'],
    excludedSites: null,
  });
  assert.equal(settings.targetLanguage, DEFAULT_SETTINGS.targetLanguage);
  assert.equal(settings.displayMode, DEFAULT_SETTINGS.displayMode);
  assert.equal(settings.translationStyle, DEFAULT_SETTINGS.translationStyle);
  assert.deepEqual(settings.api, DEFAULT_SETTINGS.api);
  assert.deepEqual(settings.batching, DEFAULT_SETTINGS.batching);
  assert.equal(settings.floatingBall.size, DEFAULT_SETTINGS.floatingBall.size);
  assert.equal(settings.floatingBall.opacity, DEFAULT_SETTINGS.floatingBall.opacity);
  assert.equal(settings.floatingBall.x, undefined);
  assert.deepEqual(settings.autoTranslateSites, ['example.com']);
  assert.deepEqual(settings.excludedSites, []);
});
