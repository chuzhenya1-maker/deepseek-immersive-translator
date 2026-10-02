import type {
  AppSettings,
  SettingsUpdate,
  TranslationStyle,
} from './settings';
import type {
  BatchLimits,
  TranslationBatchResult,
  TranslationRequestItem,
} from './translation';

export const MESSAGE_TYPES = {
  CACHE_LOOKUP: 'CACHE_LOOKUP',
  CACHE_WRITE: 'CACHE_WRITE',
  TEST_API: 'TEST_API',
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_TRANSLATION_CONFIG: 'GET_TRANSLATION_CONFIG',
  TRANSLATE_BATCH: 'TRANSLATE_BATCH',
  CANCEL_TRANSLATION_TASK: 'CANCEL_TRANSLATION_TASK',
  RUNTIME_CONFIG_CHANGED: 'RUNTIME_CONFIG_CHANGED',
  TRANSLATE_SELECTION: 'TRANSLATE_SELECTION',
  SHOW_SELECTION_LOADING: 'SHOW_SELECTION_LOADING',
  SHOW_SELECTION_TRANSLATION: 'SHOW_SELECTION_TRANSLATION',
} as const;

export interface TestApiRequest {
  type: typeof MESSAGE_TYPES.TEST_API;
}

export interface GetSettingsRequest {
  type: typeof MESSAGE_TYPES.GET_SETTINGS;
}

export interface UpdateSettingsRequest {
  type: typeof MESSAGE_TYPES.UPDATE_SETTINGS;
  payload: SettingsUpdate;
}

export interface TranslationRuntimeConfig {
  apiConfigured: boolean;
  targetLanguage: string;
  displayMode: AppSettings['displayMode'];
  translationStyle: TranslationStyle;
  academicMode: boolean;
  preserveEnglishTerms: boolean;
  customPrompt?: string;
  concurrency: number;
  batching: BatchLimits;
  floatingBall: AppSettings['floatingBall'];
  selectionTranslation: boolean;
  contextMenuTranslation: boolean;
  translationCacheEnabled: boolean;
  autoTranslateDynamicContent: boolean;
  autoTranslateSites: string[];
  excludedSites: string[];
}

export interface GetTranslationConfigRequest {
  type: typeof MESSAGE_TYPES.GET_TRANSLATION_CONFIG;
}

export interface TranslateBatchPayload {
  taskId: string;
  batchId: string;
  items: TranslationRequestItem[];
  sourceLanguage?: string;
  targetLanguage: string;
  translationStyle: TranslationStyle;
  academicMode: boolean;
  preserveEnglishTerms: boolean;
  customPrompt?: string;
}

export interface CancelTranslationTaskRequest {
  type: typeof MESSAGE_TYPES.CANCEL_TRANSLATION_TASK;
  payload: { taskId: string };
}

export interface RuntimeConfigChangedMessage {
  type: typeof MESSAGE_TYPES.RUNTIME_CONFIG_CHANGED;
  payload: TranslationRuntimeConfig;
}

export interface TranslateBatchRequest {
  type: typeof MESSAGE_TYPES.TRANSLATE_BATCH;
  payload: TranslateBatchPayload;
}

export interface TranslateSelectionPayload {
  requestId: string;
  text: string;
}

export interface TranslateSelectionRequest {
  type: typeof MESSAGE_TYPES.TRANSLATE_SELECTION;
  payload: TranslateSelectionPayload;
}

export interface TranslateSelectionResult {
  requestId: string;
  translation: string;
}

export interface ShowSelectionLoadingMessage {
  type: typeof MESSAGE_TYPES.SHOW_SELECTION_LOADING;
  payload: {
    requestId: string;
    originalText: string;
  };
}

export interface ShowSelectionTranslationMessage {
  type: typeof MESSAGE_TYPES.SHOW_SELECTION_TRANSLATION;
  payload:
    | {
        requestId: string;
        originalText: string;
        status: 'success';
        translation: string;
      }
    | {
        requestId: string;
        originalText: string;
        status: 'error';
        error: string;
      };
}

export type SelectionContentMessage =
  | ShowSelectionLoadingMessage
  | ShowSelectionTranslationMessage;

export type ExtensionRequest =
  | { type: typeof MESSAGE_TYPES.CACHE_LOOKUP; payload: { items: import('../services/translationCache').CacheLookupItem[]; context: import('../services/translationCache').TranslationCacheContext } }
  | { type: typeof MESSAGE_TYPES.CACHE_WRITE; payload: { items: import('../services/translationCache').CacheWriteItem[]; context: import('../services/translationCache').TranslationCacheContext } }
  | TestApiRequest
  | GetSettingsRequest
  | UpdateSettingsRequest
  | GetTranslationConfigRequest
  | TranslateBatchRequest
  | CancelTranslationTaskRequest
  | TranslateSelectionRequest;

export type MessageResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type GetSettingsResponse = MessageResponse<AppSettings>;
export type UpdateSettingsResponse = MessageResponse<AppSettings>;
export type TestApiResponse = MessageResponse<null>;
export type GetTranslationConfigResponse =
  MessageResponse<TranslationRuntimeConfig>;
export type TranslateBatchResponse = MessageResponse<TranslationBatchResult>;
export type CancelTranslationTaskResponse = MessageResponse<{
  cancelledRequests: number;
}>;
export type TranslateSelectionResponse =
  MessageResponse<TranslateSelectionResult>;
