import type { DisplayMode } from '../types/settings.ts';
import type { TranslationNode } from '../types/translation.ts';

const TRANSLATION_SELECTOR = '[data-ds-translation="true"]';
const ORIGINAL_HIDDEN_SELECTOR = '[data-ds-original-hidden="true"]';
const RENDERED_SOURCE_SELECTOR = '[data-ds-rendered="true"]';

const INLINE_SOURCE_TAGS = new Set([
  'SPAN',
  'STRONG',
  'EM',
  'B',
  'I',
  'SMALL',
  'MARK',
  'SUB',
  'SUP',
  'Q',
  'CITE',
  'ABBR',
  'TIME',
]);

const INTERNAL_TRANSLATION_TAGS = new Set(['LI', 'TD', 'TH']);

const SAFE_HIDE_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'FIGCAPTION',
  'SPAN',
]);

const COMPLEX_CONTENT_SELECTOR = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'img',
  'picture',
  'video',
  'audio',
  'canvas',
  'svg',
  'iframe',
  'object',
  'embed',
  'details',
  'summary',
  '[role="button"]',
  '[contenteditable="true"]',
].join(',');

export type TranslationDisplayMode = DisplayMode;

export interface RenderedTranslation {
  sourceId: string;
  sourceElement: HTMLElement;
  translationElement: HTMLElement;
}

export interface TranslationRendererOptions {
  document?: Document;
  displayMode?: TranslationDisplayMode;
  targetLanguage?: string;
  onWarning?: (message: string, error?: unknown) => void;
}

function isDisplayMode(value: string): value is TranslationDisplayMode {
  return (
    value === 'bilingual' ||
    value === 'translation-only' ||
    value === 'original-only'
  );
}

function canHideWholeSource(element: HTMLElement): boolean {
  return (
    SAFE_HIDE_TAGS.has(element.tagName) &&
    element.querySelector(COMPLEX_CONTENT_SELECTOR) === null
  );
}

export class TranslationRenderer {
  private readonly document: Document;
  private readonly rendered = new Map<string, RenderedTranslation>();
  private readonly onWarning?: (message: string, error?: unknown) => void;
  private displayMode: TranslationDisplayMode;
  private targetLanguage: string;

  constructor(options: TranslationRendererOptions = {}) {
    this.document = options.document ?? document;
    this.displayMode = options.displayMode ?? 'bilingual';
    this.targetLanguage = options.targetLanguage?.trim() || 'zh-CN';
    this.onWarning = options.onWarning;
    this.indexExistingTranslations();
    this.applyRootMode();
  }

  render(nodes: TranslationNode[]): void {
    for (const node of nodes) {
      try {
        this.renderNode(node);
      } catch (error: unknown) {
        this.onWarning?.(`Could not render translation for ${node.id}.`, error);
      }
    }
  }

  renderNode(node: TranslationNode): void {
    const translatedText = node.translatedText?.trim();
    if (
      node.status !== 'translated' ||
      !translatedText
    ) {
      return;
    }

    if (!node.element.isConnected) {
      this.onWarning?.(`Source element for ${node.id} is no longer connected.`);
      return;
    }

    const existing = this.rendered.get(node.id);
    if (
      existing?.translationElement.isConnected &&
      existing.sourceElement.isConnected &&
      existing.sourceElement === node.element
    ) {
      existing.translationElement.textContent = translatedText;
      existing.translationElement.lang = this.targetLanguage;
      this.applySourceMode(existing.sourceElement);
      return;
    }

    if (existing) {
      existing.translationElement.remove();
      existing.sourceElement.removeAttribute('data-ds-rendered');
      this.rendered.delete(node.id);
    }

    const translationElement = this.createTranslationElement(node);
    this.insertTranslation(node.element, translationElement);
    node.element.setAttribute('data-ds-rendered', 'true');
    this.rendered.set(node.id, {
      sourceId: node.id,
      sourceElement: node.element,
      translationElement,
    });
    this.applySourceMode(node.element);
  }

  setDisplayMode(mode: TranslationDisplayMode): void {
    this.displayMode = mode;
    this.applyRootMode();

    for (const rendered of this.rendered.values()) {
      if (!rendered.sourceElement.isConnected) {
        continue;
      }
      this.applySourceMode(rendered.sourceElement);
    }
  }

  setTargetLanguage(targetLanguage: string): void {
    const normalized = targetLanguage.trim();
    if (!normalized) {
      return;
    }

    this.targetLanguage = normalized;
    for (const rendered of this.rendered.values()) {
      rendered.translationElement.lang = normalized;
    }
  }

  getDisplayMode(): TranslationDisplayMode {
    return this.displayMode;
  }

  restoreOriginal(): void {
    this.restoreHiddenOriginals();
    this.removeTranslations();
    for (const element of this.document.querySelectorAll<HTMLElement>(
      RENDERED_SOURCE_SELECTOR,
    )) {
      element.removeAttribute('data-ds-rendered');
    }
    this.document.documentElement.removeAttribute('data-ds-display-mode');
    this.displayMode = 'bilingual';
  }

  removeTranslations(): void {
    for (const element of this.document.querySelectorAll<HTMLElement>(
      TRANSLATION_SELECTOR,
    )) {
      element.remove();
    }

    for (const rendered of this.rendered.values()) {
      rendered.sourceElement.removeAttribute('data-ds-rendered');
    }
    this.rendered.clear();
  }

  private createTranslationElement(node: TranslationNode): HTMLElement {
    const isInline = INLINE_SOURCE_TAGS.has(node.element.tagName);
    const element = this.document.createElement(isInline ? 'span' : 'div');
    element.className = 'ds-translation';
    element.setAttribute('data-ds-translation', 'true');
    element.setAttribute('data-ds-source-id', node.id);
    element.setAttribute('data-ds-layout', isInline ? 'inline' : 'block');
    element.lang = this.targetLanguage;
    element.textContent = node.translatedText?.trim() ?? '';
    return element;
  }

  private insertTranslation(
    sourceElement: HTMLElement,
    translationElement: HTMLElement,
  ): void {
    if (INTERNAL_TRANSLATION_TAGS.has(sourceElement.tagName)) {
      sourceElement.append(translationElement);
      return;
    }

    sourceElement.insertAdjacentElement('afterend', translationElement);
  }

  private applyRootMode(): void {
    this.document.documentElement.setAttribute(
      'data-ds-display-mode',
      this.displayMode,
    );
  }

  private applySourceMode(sourceElement: HTMLElement): void {
    const shouldHide =
      this.displayMode === 'translation-only' &&
      canHideWholeSource(sourceElement) &&
      !INTERNAL_TRANSLATION_TAGS.has(sourceElement.tagName);

    sourceElement.classList.toggle('ds-original-hidden', shouldHide);
    if (shouldHide) {
      sourceElement.setAttribute('data-ds-original-hidden', 'true');
    } else {
      sourceElement.removeAttribute('data-ds-original-hidden');
    }
  }

  private restoreHiddenOriginals(): void {
    for (const element of this.document.querySelectorAll<HTMLElement>(
      ORIGINAL_HIDDEN_SELECTOR,
    )) {
      element.classList.remove('ds-original-hidden');
      element.removeAttribute('data-ds-original-hidden');
    }
  }

  private indexExistingTranslations(): void {
    const sourceElements = new Map<string, HTMLElement>();
    for (const sourceElement of this.document.querySelectorAll<HTMLElement>(
      '[data-ds-node-id]',
    )) {
      const sourceId = sourceElement.getAttribute('data-ds-node-id');
      if (sourceId && !sourceElements.has(sourceId)) {
        sourceElements.set(sourceId, sourceElement);
      }
    }

    for (const translationElement of this.document.querySelectorAll<HTMLElement>(
      TRANSLATION_SELECTOR,
    )) {
      const sourceId = translationElement.getAttribute('data-ds-source-id');
      if (!sourceId || this.rendered.has(sourceId)) {
        continue;
      }

      const sourceElement = sourceElements.get(sourceId);
      if (!sourceElement) {
        continue;
      }

      this.rendered.set(sourceId, {
        sourceId,
        sourceElement,
        translationElement,
      });
    }

    const currentMode = this.document.documentElement.getAttribute(
      'data-ds-display-mode',
    );
    if (currentMode && isDisplayMode(currentMode)) {
      this.displayMode = currentMode;
    }
  }
}
