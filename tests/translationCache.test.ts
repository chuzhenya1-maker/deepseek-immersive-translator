import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CACHE_VERSION,
  MAX_CACHE_ENTRIES,
  TRANSLATION_CACHE_STORAGE_KEY,
  clearTranslationCache,
  createTranslationCacheKey,
  getCachedTranslations,
  getTranslationCacheSize,
  setCachedTranslations,
  type TranslationCacheEntry,
} from '../src/services/translationCache.ts';

const CONTEXT = {
  targetLanguage: 'zh-CN',
  translationStyle: 'general' as const,
  academicMode: false,
  preserveEnglishTerms: false,
};

function storageFixture(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  Object.assign(globalThis, {
    chrome: {
      storage: {
        local: {
          async get(key: string) {
            return { [key]: data[key] };
          },
          async set(values: Record<string, unknown>) {
            Object.assign(data, values);
          },
          async remove(key: string) {
            delete data[key];
          },
        },
      },
    },
  });
  return data;
}

test('cache key is deterministic and separates language, style, and prompt', async () => {
  const first = await createTranslationCacheKey('Text', CONTEXT);
  assert.equal(await createTranslationCacheKey('Text', CONTEXT), first);
  assert.notEqual(
    await createTranslationCacheKey('Text', { ...CONTEXT, targetLanguage: 'ja-JP' }),
    first,
  );
  assert.notEqual(
    await createTranslationCacheKey('Text', { ...CONTEXT, translationStyle: 'academic' }),
    first,
  );
  assert.notEqual(
    await createTranslationCacheKey('Text', { ...CONTEXT, customPrompt: 'Formal' }),
    first,
  );
});

test('cache supports hit, miss, batch writes, and isolated clear', async () => {
  const data = storageFixture({ settings: { apiKey: 'preserve-me' } });
  assert.equal(
    await setCachedTranslations(
      [{ id: 'a', text: 'Original', translation: '译文' }],
      CONTEXT,
    ),
    true,
  );
  const hits = await getCachedTranslations(
    [
      { id: 'a', text: 'Original' },
      { id: 'b', text: 'Missing' },
    ],
    CONTEXT,
  );
  assert.equal(hits.get('a'), '译文');
  assert.equal(hits.has('b'), false);
  assert.equal(await getTranslationCacheSize(), 1);
  await clearTranslationCache();
  assert.equal(await getTranslationCacheSize(), 0);
  assert.deepEqual(data.settings, { apiKey: 'preserve-me' });
});

test('corrupted cache is ignored and LRU eviction removes a batch', async () => {
  storageFixture({
    [TRANSLATION_CACHE_STORAGE_KEY]: { version: CACHE_VERSION, entries: 'bad' },
  });
  assert.equal(await getTranslationCacheSize(), 0);

  const entries: Record<string, TranslationCacheEntry> = {};
  for (let index = 0; index <= MAX_CACHE_ENTRIES; index += 1) {
    const key = `key-${index}`;
    entries[key] = {
      key,
      originalText: `text-${index}`,
      translation: `translation-${index}`,
      targetLanguage: 'zh-CN',
      translationStyle: 'general',
      createdAt: index,
      lastAccessedAt: index,
    };
  }
  storageFixture({
    [TRANSLATION_CACHE_STORAGE_KEY]: { version: CACHE_VERSION, entries },
  });
  await setCachedTranslations(
    [{ id: 'new', text: 'Brand new text', translation: '新译文' }],
    CONTEXT,
  );
  assert.equal(await getTranslationCacheSize(), 4_500);
});
