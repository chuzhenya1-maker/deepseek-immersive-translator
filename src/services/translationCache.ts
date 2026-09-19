import type { TranslationStyle } from '../types/settings.ts';

export const CACHE_VERSION = 1;
export const PROMPT_VERSION = 1;
export const MAX_CACHE_ENTRIES = 5_000;
export const CACHE_EVICTION_BATCH = 500;
export const MAX_CACHE_TEXT_CHARACTERS = 20_000;
export const TRANSLATION_CACHE_STORAGE_KEY = 'translationCache';

export interface TranslationCacheContext {
  targetLanguage: string;
  translationStyle: TranslationStyle;
  academicMode: boolean;
  preserveEnglishTerms: boolean;
  customPrompt?: string;
}

export interface TranslationCacheEntry {
  key: string;
  originalText: string;
  translation: string;
  targetLanguage: string;
  translationStyle: TranslationStyle;
  createdAt: number;
  lastAccessedAt: number;
}

interface TranslationCacheStore {
  version: number;
  entries: Record<string, TranslationCacheEntry>;
}

export interface CacheLookupItem {
  id: string;
  text: string;
}

export interface CacheWriteItem extends CacheLookupItem {
  translation: string;
}

const EMPTY_STORE: TranslationCacheStore = {
  version: CACHE_VERSION,
  entries: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCacheEntry(value: unknown, key: string): value is TranslationCacheEntry {
  return (
    isRecord(value) &&
    value.key === key &&
    typeof value.originalText === 'string' &&
    typeof value.translation === 'string' &&
    typeof value.targetLanguage === 'string' &&
    typeof value.translationStyle === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.lastAccessedAt === 'number'
  );
}

async function loadStore(): Promise<TranslationCacheStore> {
  try {
    const result = await chrome.storage.local.get(TRANSLATION_CACHE_STORAGE_KEY);
    const raw = result[TRANSLATION_CACHE_STORAGE_KEY] as unknown;
    if (!isRecord(raw) || raw.version !== CACHE_VERSION || !isRecord(raw.entries)) {
      return structuredClone(EMPTY_STORE);
    }
    const entries: Record<string, TranslationCacheEntry> = {};
    for (const [key, value] of Object.entries(raw.entries)) {
      if (isCacheEntry(value, key) && value.translation.trim()) {
        entries[key] = value;
      }
    }
    return { version: CACHE_VERSION, entries };
  } catch {
    return structuredClone(EMPTY_STORE);
  }
}

async function saveStore(store: TranslationCacheStore): Promise<boolean> {
  try {
    await chrome.storage.local.set({ [TRANSLATION_CACHE_STORAGE_KEY]: store });
    return true;
  } catch {
    return false;
  }
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function createTranslationCacheKey(
  originalText: string,
  context: TranslationCacheContext,
): Promise<string> {
  return sha256(
    JSON.stringify({
      cacheVersion: CACHE_VERSION,
      promptVersion: PROMPT_VERSION,
      originalText,
      targetLanguage: context.targetLanguage,
      translationStyle: context.translationStyle,
      academicMode: context.academicMode,
      preserveEnglishTerms: context.preserveEnglishTerms,
      customPrompt: context.customPrompt?.trim() ?? '',
    }),
  );
}

export async function getCachedTranslations(
  items: readonly CacheLookupItem[],
  context: TranslationCacheContext,
): Promise<Map<string, string>> {
  if (items.length === 0) {
    return new Map();
  }
  const store = await loadStore();
  const now = Date.now();
  const result = new Map<string, string>();
  let touched = false;
  const keyed = await Promise.all(
    items.map(async (item) => ({
      item,
      key: await createTranslationCacheKey(item.text, context),
    })),
  );
  for (const { item, key } of keyed) {
    const entry = store.entries[key];
    if (!entry) {
      continue;
    }
    entry.lastAccessedAt = now;
    result.set(item.id, entry.translation);
    touched = true;
  }
  if (touched) {
    await saveStore(store);
  }
  return result;
}

export async function setCachedTranslations(
  items: readonly CacheWriteItem[],
  context: TranslationCacheContext,
): Promise<boolean> {
  const validItems = items.filter(
    (item) =>
      item.text.length <= MAX_CACHE_TEXT_CHARACTERS &&
      item.translation.length <= MAX_CACHE_TEXT_CHARACTERS &&
      item.translation.trim().length > 0,
  );
  if (validItems.length === 0) {
    return true;
  }
  const store = await loadStore();
  const now = Date.now();
  const keyed = await Promise.all(
    validItems.map(async (item) => ({
      item,
      key: await createTranslationCacheKey(item.text, context),
    })),
  );
  for (const { item, key } of keyed) {
    const existing = store.entries[key];
    store.entries[key] = {
      key,
      originalText: item.text,
      translation: item.translation,
      targetLanguage: context.targetLanguage,
      translationStyle: context.translationStyle,
      createdAt: existing?.createdAt ?? now,
      lastAccessedAt: now,
    };
  }

  const entries = Object.values(store.entries);
  if (entries.length > MAX_CACHE_ENTRIES) {
    const targetSize = MAX_CACHE_ENTRIES - CACHE_EVICTION_BATCH;
    entries
      .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt)
      .slice(0, Math.max(0, entries.length - targetSize))
      .forEach((entry) => delete store.entries[entry.key]);
  }
  return saveStore(store);
}

export async function clearTranslationCache(): Promise<void> {
  await chrome.storage.local.remove(TRANSLATION_CACHE_STORAGE_KEY);
}

export async function getTranslationCacheSize(): Promise<number> {
  return Object.keys((await loadStore()).entries).length;
}
