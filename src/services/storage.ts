import { DEFAULT_SETTINGS } from './config.ts';
import type {
  AppSettings,
  DisplayMode,
  SettingsUpdate,
  TranslationStyle,
} from '../types/settings';

const SETTINGS_STORAGE_KEY = 'settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeValue<T>(defaults: T, stored: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(stored) ? [...stored] : [...defaults]) as T;
  }

  if (isRecord(defaults)) {
    const storedRecord = isRecord(stored) ? stored : {};
    const merged: Record<string, unknown> = { ...storedRecord };

    for (const [key, defaultValue] of Object.entries(defaults)) {
      merged[key] = mergeValue(defaultValue, storedRecord[key]);
    }

    return merged as T;
  }

  return typeof stored === typeof defaults ? (stored as T) : defaults;
}

export function mergeSettings(stored: unknown): AppSettings {
  const merged = mergeValue(DEFAULT_SETTINGS, stored);
  const displayModes = new Set<DisplayMode>([
    'bilingual',
    'translation-only',
    'original-only',
  ]);
  const translationStyles = new Set<TranslationStyle>([
    'general',
    'natural',
    'academic',
    'literal',
    'professional',
  ]);
  const finiteInRange = (
    value: number,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number =>
    Number.isFinite(value) && value >= minimum && value <= maximum
      ? value
      : fallback;
  const positiveInteger = (
    value: number,
    fallback: number,
    maximum: number,
  ): number =>
    Number.isInteger(value) && value >= 1 && value <= maximum
      ? value
      : fallback;
  const stringList = (value: string[]): string[] =>
    [...new Set(value.filter((item) => typeof item === 'string'))];

  return {
    ...merged,
    targetLanguage:
      merged.targetLanguage.trim() || DEFAULT_SETTINGS.targetLanguage,
    displayMode: displayModes.has(merged.displayMode)
      ? merged.displayMode
      : DEFAULT_SETTINGS.displayMode,
    translationStyle: translationStyles.has(merged.translationStyle)
      ? merged.translationStyle
      : DEFAULT_SETTINGS.translationStyle,
    api: {
      ...merged.api,
      baseUrl: merged.api.baseUrl.trim() || DEFAULT_SETTINGS.api.baseUrl,
      model: merged.api.model.trim() || DEFAULT_SETTINGS.api.model,
      temperature: finiteInRange(
        merged.api.temperature,
        DEFAULT_SETTINGS.api.temperature,
        0,
        2,
      ),
      timeout: positiveInteger(
        merged.api.timeout,
        DEFAULT_SETTINGS.api.timeout,
        300_000,
      ),
      concurrency: positiveInteger(
        merged.api.concurrency,
        DEFAULT_SETTINGS.api.concurrency,
        10,
      ),
    },
    batching: {
      maxCharacters: positiveInteger(
        merged.batching.maxCharacters,
        DEFAULT_SETTINGS.batching.maxCharacters,
        20_000,
      ),
      maxItems: positiveInteger(
        merged.batching.maxItems,
        DEFAULT_SETTINGS.batching.maxItems,
        100,
      ),
    },
    floatingBall: {
      enabled: merged.floatingBall.enabled,
      size: finiteInRange(
        merged.floatingBall.size,
        DEFAULT_SETTINGS.floatingBall.size,
        32,
        96,
      ),
      opacity: finiteInRange(
        merged.floatingBall.opacity,
        DEFAULT_SETTINGS.floatingBall.opacity,
        0.2,
        1,
      ),
      ...(Number.isFinite(merged.floatingBall.x)
        ? { x: merged.floatingBall.x }
        : {}),
      ...(Number.isFinite(merged.floatingBall.y)
        ? { y: merged.floatingBall.y }
        : {}),
    },
    autoTranslateSites: stringList(merged.autoTranslateSites),
    excludedSites: stringList(merged.excludedSites),
    customPrompt:
      typeof merged.customPrompt === 'string'
        ? merged.customPrompt
        : undefined,
  };
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const rawSettings = stored[SETTINGS_STORAGE_KEY] as unknown;
  const settings = mergeSettings(rawSettings);

  if (JSON.stringify(rawSettings) !== JSON.stringify(settings)) {
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
  }

  return settings;
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const normalizedSettings = mergeSettings(settings);
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: normalizedSettings });
  return normalizedSettings;
}

export async function updateSettings(
  updates: SettingsUpdate,
): Promise<AppSettings> {
  const currentSettings = await getSettings();
  const nextSettings = mergeValue(currentSettings, updates);
  return saveSettings(nextSettings);
}

export async function resetSettings(): Promise<AppSettings> {
  const defaultSettings = mergeSettings(undefined);
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: defaultSettings });
  return defaultSettings;
}
