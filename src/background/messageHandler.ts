import { DeepSeekClient, DeepSeekClientError } from './deepseek';
import { buildTranslationSystemPrompt, buildTranslationUserPrompt } from './promptBuilder';
import {
  mapTranslationResponse,
  parseTranslationResponse,
  TranslationResponseError,
} from './responseParser';
import {
  cancelTranslationTask,
  registerTranslationRequest,
  releaseTranslationRequest,
} from './requestRegistry';
import { getSettings, updateSettings } from '../services/storage';
import {
  MESSAGE_TYPES,
  type ExtensionRequest,
  type MessageResponse,
  type TranslateBatchPayload,
  type TranslationRuntimeConfig,
} from '../types/message';
import type {
  TranslationBatchResult,
  TranslationErrorCode,
} from '../types/translation';
import { MAX_SELECTION_CHARACTERS } from '../types/selection';
import {
  getSelectionErrorMessage,
  translateSelectionText,
} from './selectionTranslation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTranslationStyle(value: unknown): boolean {
  return (
    value === 'general' ||
    value === 'natural' ||
    value === 'academic' ||
    value === 'literal' ||
    value === 'professional'
  );
}

function isTranslateBatchPayload(value: unknown): value is TranslateBatchPayload {
  if (
    !isRecord(value) ||
    typeof value.taskId !== 'string' ||
    value.taskId.length === 0 ||
    typeof value.batchId !== 'string' ||
    value.batchId.length === 0 ||
    !Array.isArray(value.items) ||
    value.items.length === 0 ||
    typeof value.targetLanguage !== 'string' ||
    value.targetLanguage.length === 0 ||
    !isTranslationStyle(value.translationStyle) ||
    typeof value.academicMode !== 'boolean' ||
    typeof value.preserveEnglishTerms !== 'boolean' ||
    (value.sourceLanguage !== undefined &&
      typeof value.sourceLanguage !== 'string') ||
    (value.customPrompt !== undefined && typeof value.customPrompt !== 'string')
  ) {
    return false;
  }

  return value.items.every(
    (item) =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      item.id.length > 0 &&
      typeof item.text === 'string' &&
      item.text.length > 0,
  );
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (
    value.type === MESSAGE_TYPES.GET_SETTINGS ||
    value.type === MESSAGE_TYPES.TEST_API ||
    value.type === MESSAGE_TYPES.GET_TRANSLATION_CONFIG
  ) {
    return true;
  }

  if (value.type === MESSAGE_TYPES.UPDATE_SETTINGS) {
    return isRecord(value.payload);
  }

  if (value.type === MESSAGE_TYPES.CANCEL_TRANSLATION_TASK) {
    return (
      isRecord(value.payload) &&
      typeof value.payload.taskId === 'string' &&
      value.payload.taskId.length > 0
    );
  }

  if (value.type === MESSAGE_TYPES.TRANSLATE_SELECTION) {
    return (
      isRecord(value.payload) &&
      typeof value.payload.requestId === 'string' &&
      value.payload.requestId.length > 0 &&
      typeof value.payload.text === 'string' &&
      value.payload.text.trim().length > 0 &&
      value.payload.text.trim().length <= MAX_SELECTION_CHARACTERS
    );
  }

  return (
    value.type === MESSAGE_TYPES.TRANSLATE_BATCH &&
    isTranslateBatchPayload(value.payload)
  );
}

function getSafeErrorMessage(error: unknown): string {
  return error instanceof DeepSeekClientError
    ? error.message
    : '操作失败，请稍后重试';
}

function getTranslationRuntimeConfig(
  settings: Awaited<ReturnType<typeof getSettings>>,
): TranslationRuntimeConfig {
  return {
    apiConfigured: settings.api.apiKey.trim().length > 0,
    targetLanguage: settings.targetLanguage,
    displayMode: settings.displayMode,
    translationStyle: settings.translationStyle,
    academicMode: settings.academicMode,
    preserveEnglishTerms: settings.preserveEnglishTerms,
    ...(settings.customPrompt === undefined
      ? {}
      : { customPrompt: settings.customPrompt }),
    concurrency: settings.api.concurrency,
    batching: settings.batching,
    floatingBall: settings.floatingBall,
    selectionTranslation: settings.selectionTranslation,
    contextMenuTranslation: settings.contextMenuTranslation,
    translationCacheEnabled: settings.translationCacheEnabled,
    autoTranslateDynamicContent: settings.autoTranslateDynamicContent,
    autoTranslateSites: settings.autoTranslateSites,
    excludedSites: settings.excludedSites,
  };
}

async function broadcastRuntimeConfig(
  config: TranslationRuntimeConfig,
): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id !== undefined)
      .map((tab) =>
        chrome.tabs.sendMessage(tab.id!, {
          type: MESSAGE_TYPES.RUNTIME_CONFIG_CHANGED,
          payload: config,
        }),
      ),
  );
}

function classifyDeepSeekError(error: DeepSeekClientError): {
  errorCode: TranslationErrorCode;
  retryable: boolean;
} {
  switch (error.code) {
    case 'MISSING_API_KEY':
      return { errorCode: 'MISSING_API_KEY', retryable: false };
    case 'AUTHENTICATION':
      return { errorCode: 'AUTHENTICATION_ERROR', retryable: false };
    case 'INSUFFICIENT_BALANCE':
      return { errorCode: 'INSUFFICIENT_BALANCE', retryable: false };
    case 'INVALID_CONFIGURATION':
      return { errorCode: 'INVALID_CONFIGURATION', retryable: false };
    case 'RATE_LIMIT':
      return { errorCode: 'RATE_LIMIT_ERROR', retryable: true };
    case 'TIMEOUT':
      return { errorCode: 'TIMEOUT_ERROR', retryable: true };
    case 'CANCELLED':
      return { errorCode: 'CANCELLED', retryable: false };
    case 'NETWORK':
      return { errorCode: 'NETWORK_ERROR', retryable: true };
    case 'SERVICE_UNAVAILABLE':
      return { errorCode: 'SERVER_ERROR', retryable: true };
    case 'UNEXPECTED_RESPONSE':
      return { errorCode: 'INVALID_RESPONSE', retryable: true };
  }
}

async function translateBatch(
  payload: TranslateBatchPayload,
): Promise<TranslationBatchResult> {
  const requestController = registerTranslationRequest(
    payload.taskId,
    payload.batchId,
  );
  try {
    const settings = await getSettings();
    const client = new DeepSeekClient(settings.api);
    const rawResponse = await client.translateBatch({
      systemPrompt: buildTranslationSystemPrompt(payload),
      userPrompt: buildTranslationUserPrompt(payload),
      signal: requestController.signal,
    });
    const mapped = mapTranslationResponse(
      parseTranslationResponse(rawResponse),
      payload.items,
    );

    if (import.meta.env.DEV && mapped.unknownIds.length > 0) {
      console.warn(
        `[DeepSeek Immersive Translator] Ignored ${mapped.unknownIds.length} unknown translation ID(s).`,
      );
    }

    return {
      taskId: payload.taskId,
      batchId: payload.batchId,
      translations: mapped.translations,
      success: true,
    };
  } catch (error: unknown) {
    if (error instanceof DeepSeekClientError) {
      const classification = classifyDeepSeekError(error);
      return {
        taskId: payload.taskId,
        batchId: payload.batchId,
        translations: [],
        success: false,
        error: error.message,
        ...classification,
      };
    }

    if (error instanceof TranslationResponseError) {
      return {
        taskId: payload.taskId,
        batchId: payload.batchId,
        translations: [],
        success: false,
        error: error.message,
        errorCode: error.kind,
        retryable: true,
      };
    }

    return {
      taskId: payload.taskId,
      batchId: payload.batchId,
      translations: [],
      success: false,
      error: '翻译请求失败，请稍后重试',
      errorCode: 'UNKNOWN',
      retryable: false,
    };
  } finally {
    releaseTranslationRequest(payload.taskId, payload.batchId);
  }
}

export async function handleExtensionMessage(
  request: ExtensionRequest,
): Promise<MessageResponse<unknown>> {
  try {
    switch (request.type) {
      case MESSAGE_TYPES.GET_SETTINGS:
        return { ok: true, data: await getSettings() };

      case MESSAGE_TYPES.UPDATE_SETTINGS: {
        const settings = await updateSettings(request.payload);
        void broadcastRuntimeConfig(getTranslationRuntimeConfig(settings)).catch(
          () => undefined,
        );
        return { ok: true, data: settings };
      }

      case MESSAGE_TYPES.GET_TRANSLATION_CONFIG:
        return {
          ok: true,
          data: getTranslationRuntimeConfig(await getSettings()),
        };

      case MESSAGE_TYPES.TRANSLATE_BATCH:
        return { ok: true, data: await translateBatch(request.payload) };

      case MESSAGE_TYPES.CANCEL_TRANSLATION_TASK:
        return {
          ok: true,
          data: {
            cancelledRequests: cancelTranslationTask(request.payload.taskId),
          },
        };

      case MESSAGE_TYPES.TRANSLATE_SELECTION:
        try {
          return {
            ok: true,
            data: await translateSelectionText(request.payload),
          };
        } catch (error: unknown) {
          return { ok: false, error: getSelectionErrorMessage(error) };
        }

      case MESSAGE_TYPES.TEST_API: {
        const settings = await getSettings();
        const client = new DeepSeekClient(settings.api);
        await client.testConnection();
        return { ok: true, data: null };
      }
    }
  } catch (error: unknown) {
    return { ok: false, error: getSafeErrorMessage(error) };
  }
}
