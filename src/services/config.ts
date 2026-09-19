import type { AppSettings } from '../types/settings';

export const DEFAULT_SETTINGS: AppSettings = {
  enabled: true,
  targetLanguage: 'zh-CN',
  displayMode: 'bilingual',
  translationStyle: 'general',
  academicMode: false,
  preserveEnglishTerms: false,
  api: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    temperature: 0.2,
    timeout: 60_000,
    concurrency: 2,
  },
  batching: {
    maxCharacters: 6_000,
    maxItems: 20,
  },
  floatingBall: {
    enabled: true,
    size: 48,
    opacity: 0.9,
  },
  selectionTranslation: true,
  contextMenuTranslation: true,
  translationCacheEnabled: true,
  autoTranslateDynamicContent: false,
  autoTranslateSites: [],
  excludedSites: [],
};
