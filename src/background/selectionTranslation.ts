import { getSettings } from '../services/storage.ts';
import {
  getCachedTranslations,
  setCachedTranslations,
  type TranslationCacheContext,
} from '../services/translationCache.ts';
import type {
  TranslateBatchPayload,
  TranslateSelectionPayload,
  TranslateSelectionResult,
} from '../types/message.ts';
import { MAX_SELECTION_CHARACTERS } from '../types/selection.ts';
import { DeepSeekClient, DeepSeekClientError } from './deepseek.ts';
import { buildTranslationSystemPrompt, buildTranslationUserPrompt } from './promptBuilder.ts';
import {
  mapTranslationResponse,
  parseTranslationResponse,
  TranslationResponseError,
} from './responseParser.ts';

const RETRY_DELAYS = [1_000, 3_000] as const;
const RETRYABLE_CODES = new Set([
  'RATE_LIMIT',
  'TIMEOUT',
  'NETWORK',
  'SERVICE_UNAVAILABLE',
  'UNEXPECTED_RESPONSE',
]);

export class SelectionTranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectionTranslationError';
  }
}

export interface SelectionTranslationDependencies {
  sleep?: (delay: number) => Promise<void>;
  createClient?: (
    options: ConstructorParameters<typeof DeepSeekClient>[0],
  ) => Pick<DeepSeekClient, 'translateBatch'>;
}

function sleep(delay: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delay));
}

function shouldRetry(error: unknown): boolean {
  return (
    error instanceof TranslationResponseError ||
    (error instanceof DeepSeekClientError && RETRYABLE_CODES.has(error.code))
  );
}

export function getSelectionErrorMessage(error: unknown): string {
  if (
    error instanceof DeepSeekClientError ||
    error instanceof TranslationResponseError ||
    error instanceof SelectionTranslationError
  ) {
    return error.message;
  }
  return '翻译失败，请稍后重试';
}

export async function translateSelectionText(
  payload: TranslateSelectionPayload,
  dependencies: SelectionTranslationDependencies = {},
): Promise<TranslateSelectionResult> {
  const text = payload.text.trim();
  if (!text) {
    throw new SelectionTranslationError('选中文本为空');
  }
  if (text.length > MAX_SELECTION_CHARACTERS) {
    throw new SelectionTranslationError('选中文本过长，请减少选择范围');
  }

  const settings = await getSettings();
  if (!settings.api.apiKey.trim()) {
    throw new SelectionTranslationError('尚未配置 DeepSeek API Key');
  }
  const itemId = `selection-item-${payload.requestId}`;
  const cacheContext: TranslationCacheContext = {
    targetLanguage: settings.targetLanguage,
    translationStyle: settings.translationStyle,
    academicMode: settings.academicMode,
    preserveEnglishTerms: settings.preserveEnglishTerms,
    ...(settings.customPrompt === undefined
      ? {}
      : { customPrompt: settings.customPrompt }),
  };
  if (settings.translationCacheEnabled) {
    const cached = await getCachedTranslations(
      [{ id: itemId, text }],
      cacheContext,
    );
    const translation = cached.get(itemId);
    if (translation) {
      return { requestId: payload.requestId, translation };
    }
  }
  const promptRequest: TranslateBatchPayload = {
    taskId: payload.requestId,
    batchId: payload.requestId,
    items: [{ id: itemId, text }],
    targetLanguage: settings.targetLanguage,
    translationStyle: settings.translationStyle,
    academicMode: settings.academicMode,
    preserveEnglishTerms: settings.preserveEnglishTerms,
    ...(settings.customPrompt === undefined
      ? {}
      : { customPrompt: settings.customPrompt }),
  };
  const client = dependencies.createClient
    ? dependencies.createClient(settings.api)
    : new DeepSeekClient(settings.api);
  const wait = dependencies.sleep ?? sleep;

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const rawResponse = await client.translateBatch({
        systemPrompt: buildTranslationSystemPrompt(promptRequest),
        userPrompt: buildTranslationUserPrompt(promptRequest),
      });
      const mapped = mapTranslationResponse(
        parseTranslationResponse(rawResponse),
        promptRequest.items,
      );
      const result = {
        requestId: payload.requestId,
        translation: mapped.translations[0]!.translation,
      };
      if (settings.translationCacheEnabled) {
        await setCachedTranslations(
          [{ id: itemId, text, translation: result.translation }],
          cacheContext,
        );
      }
      return result;
    } catch (error: unknown) {
      lastError = error;
      if (!shouldRetry(error) || attempt >= 2) {
        break;
      }
      await wait(RETRY_DELAYS[attempt] ?? RETRY_DELAYS[1]);
    }
  }

  throw lastError;
}
