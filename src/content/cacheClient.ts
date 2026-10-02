import { sendExtensionMessage } from '../services/message.ts';
import { MESSAGE_TYPES } from '../types/message.ts';
import type { CacheLookupItem, CacheWriteItem, TranslationCacheContext } from '../services/translationCache.ts';

export async function getCachedTranslations(
  items: readonly CacheLookupItem[], context: TranslationCacheContext,
): Promise<Map<string, string>> {
  try {
    const response = await sendExtensionMessage<[string, string][]>({
      type: MESSAGE_TYPES.CACHE_LOOKUP, payload: { items: [...items], context },
    });
    return response.ok ? new Map(response.data) : new Map();
  } catch { return new Map(); }
}

export async function setCachedTranslations(
  items: readonly CacheWriteItem[], context: TranslationCacheContext,
): Promise<boolean> {
  try {
    const response = await sendExtensionMessage<boolean>({
      type: MESSAGE_TYPES.CACHE_WRITE, payload: { items: [...items], context },
    });
    return response.ok && response.data;
  } catch { return false; }
}
