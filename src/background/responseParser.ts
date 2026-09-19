import type {
  TranslationRequestItem,
  TranslationResultItem,
} from '../types/translation';

export class TranslationResponseError extends Error {
  readonly kind: 'INVALID_RESPONSE' | 'MISSING_TRANSLATION';
  readonly missingIds: string[];

  constructor(
    message: string,
    kind: 'INVALID_RESPONSE' | 'MISSING_TRANSLATION',
    missingIds: string[] = [],
  ) {
    super(message);
    this.name = 'TranslationResponseError';
    this.kind = kind;
    this.missingIds = missingIds;
  }
}

interface ParsedTranslationResponse {
  translations: TranslationResultItem[];
}

export interface MappedTranslationResponse {
  translations: TranslationResultItem[];
  unknownIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

export function parseTranslationResponse(
  rawResponse: string,
): ParsedTranslationResponse {
  let payload: unknown;

  try {
    payload = JSON.parse(stripMarkdownFence(rawResponse)) as unknown;
  } catch {
    throw new TranslationResponseError(
      'DeepSeek 返回的翻译格式无效',
      'INVALID_RESPONSE',
    );
  }

  if (!isRecord(payload) || !Array.isArray(payload.translations)) {
    throw new TranslationResponseError(
      'DeepSeek 返回的翻译格式无效',
      'INVALID_RESPONSE',
    );
  }

  const translations: TranslationResultItem[] = [];
  const seenIds = new Set<string>();

  for (const item of payload.translations) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      item.id.length === 0 ||
      typeof item.translation !== 'string' ||
      item.translation.trim().length === 0
    ) {
      throw new TranslationResponseError(
        'DeepSeek 返回的翻译格式无效',
        'INVALID_RESPONSE',
      );
    }

    if (seenIds.has(item.id)) {
      throw new TranslationResponseError(
        'DeepSeek 返回了重复的翻译 ID',
        'INVALID_RESPONSE',
      );
    }

    seenIds.add(item.id);
    translations.push({ id: item.id, translation: item.translation });
  }

  return { translations };
}

export function mapTranslationResponse(
  response: ParsedTranslationResponse,
  requestedItems: TranslationRequestItem[],
): MappedTranslationResponse {
  const requestedIds = new Set(requestedItems.map((item) => item.id));
  const byId = new Map(
    response.translations
      .filter((item) => requestedIds.has(item.id))
      .map((item) => [item.id, item]),
  );
  const missingIds = requestedItems
    .map((item) => item.id)
    .filter((id) => !byId.has(id));

  if (missingIds.length > 0) {
    throw new TranslationResponseError(
      'DeepSeek 返回的翻译项目不完整',
      'MISSING_TRANSLATION',
      missingIds,
    );
  }

  const unknownIds = response.translations
    .map((item) => item.id)
    .filter((id) => !requestedIds.has(id));

  return {
    translations: requestedItems.map((item) => byId.get(item.id)!),
    unknownIds,
  };
}
