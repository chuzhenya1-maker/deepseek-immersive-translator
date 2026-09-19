export type DisplayMode =
  | 'bilingual'
  | 'translation-only'
  | 'original-only';

export type TranslationStyle =
  | 'general'
  | 'natural'
  | 'academic'
  | 'literal'
  | 'professional';

export interface DeepSeekApiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  timeout: number;
  concurrency: number;
}

export interface AppSettings {
  enabled: boolean;
  targetLanguage: string;
  displayMode: DisplayMode;
  translationStyle: TranslationStyle;
  academicMode: boolean;
  preserveEnglishTerms: boolean;
  api: DeepSeekApiSettings;
  batching: {
    maxCharacters: number;
    maxItems: number;
  };
  floatingBall: {
    enabled: boolean;
    size: number;
    opacity: number;
    x?: number;
    y?: number;
  };
  selectionTranslation: boolean;
  contextMenuTranslation: boolean;
  translationCacheEnabled: boolean;
  autoTranslateDynamicContent: boolean;
  autoTranslateSites: string[];
  excludedSites: string[];
  customPrompt?: string;
}

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [Key in keyof T]?: DeepPartial<T[Key]> }
    : T;

export type SettingsUpdate = DeepPartial<AppSettings>;
