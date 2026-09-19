export type TranslationNodeStatus =
  | 'pending'
  | 'translating'
  | 'translated'
  | 'failed'
  | 'skipped';

/** Content-script-only model. HTMLElement must never cross runtime messaging. */
export interface TranslationNode {
  id: string;
  element: HTMLElement;
  originalText: string;
  translatedText?: string;
  status: TranslationNodeStatus;
}

/** Serializable representation used by future background messages. */
export interface TranslationRequestItem {
  id: string;
  text: string;
}

export interface TranslationBatch {
  id: string;
  items: TranslationRequestItem[];
  characterCount: number;
}

export interface BatchLimits {
  maxCharacters: number;
  maxItems: number;
}

export type TranslationBatchStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface TranslationBatchTask extends TranslationBatch {
  status: TranslationBatchStatus;
  retryCount: number;
  error?: string;
}

export interface TranslationResultItem {
  id: string;
  translation: string;
}

export type TranslationErrorCode =
  | 'MISSING_API_KEY'
  | 'AUTHENTICATION_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_CONFIGURATION'
  | 'RATE_LIMIT_ERROR'
  | 'TIMEOUT_ERROR'
  | 'CANCELLED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'INVALID_RESPONSE'
  | 'MISSING_TRANSLATION'
  | 'UNKNOWN';

export interface TranslationBatchResult {
  taskId?: string;
  batchId: string;
  translations: TranslationResultItem[];
  success: boolean;
  error?: string;
  errorCode?: TranslationErrorCode;
  retryable?: boolean;
}

export type TranslationQueueStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'error';

export interface TranslationProgress {
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  totalItems: number;
  translatedItems: number;
  failedItems: number;
}

export type TranslationTaskStatus =
  | 'idle'
  | 'scanning'
  | 'translating'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'error';

export interface TranslationTaskState extends TranslationProgress {
  status: TranslationTaskStatus;
  progress: number;
  taskId?: string;
  currentMessage?: string;
  error?: string;
}

export type TranslationStateListener = (
  state: TranslationTaskState,
) => void;
