const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'CODE',
  'PRE',
  'TEXTAREA',
  'INPUT',
  'SELECT',
  'OPTION',
  'BUTTON',
  'SVG',
  'CANVAS',
  'MATH',
  'NOSCRIPT',
  'IFRAME',
  'FORM',
]);

const EXCLUDED_LANDMARK_TAGS = new Set(['NAV', 'ASIDE', 'FOOTER', 'MENU']);
const EXCLUDED_ROLES = new Set([
  'alert',
  'button',
  'dialog',
  'listbox',
  'menu',
  'menubar',
  'navigation',
  'tab',
  'toolbar',
  'tooltip',
  'tree',
]);
const CODE_CLASS_PATTERN =
  /(?:^|\s)(?:highlight|code-block|hljs|prism|monaco-editor|codemirror)(?:\s|$)|(?:^|\s)language-[^\s]+/i;
const MATH_CLASS_PATTERN = /(?:^|\s)(?:mathjax|katex|katex-display)(?:\s|$)/i;
const URL_PATTERN = /^(?:https?:\/\/|ftp:\/\/|www\.)\S+$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOWS_PATH_PATTERN = /^[a-z]:\\(?:[^\\\s]+\\?)+$/i;
const UNIX_PATH_PATTERN = /^(?:\/[^/\s]+){2,}\/?$/;
const FILE_NAME_PATTERN =
  /^[^\s/\\]+\.(?:css|csv|docx?|gif|html?|jpe?g|json|md|pdf|png|pptx?|py|sql|svg|tsx?|txt|xlsx?|xml|ya?ml)$/i;
const NUMBER_PATTERN = /^[+-]?\d[\d\s,._:/-]*%?$/;

export type VisibilityCache = WeakMap<HTMLElement, boolean>;

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function shouldTranslateText(text: string): boolean {
  const normalized = normalizeText(text);

  if (!normalized) {
    return false;
  }

  if (
    NUMBER_PATTERN.test(normalized) ||
    URL_PATTERN.test(normalized) ||
    EMAIL_PATTERN.test(normalized) ||
    WINDOWS_PATH_PATTERN.test(normalized) ||
    UNIX_PATH_PATTERN.test(normalized) ||
    FILE_NAME_PATTERN.test(normalized)
  ) {
    return false;
  }

  const letters = normalized.match(/\p{L}/gu);
  return letters !== null && letters.length >= 2;
}

function hasExcludedClass(element: HTMLElement): boolean {
  return (
    CODE_CLASS_PATTERN.test(element.className) ||
    MATH_CLASS_PATTERN.test(element.className)
  );
}

function isHeaderOutsideMainContent(element: HTMLElement): boolean {
  if (element.tagName !== 'HEADER' || element.closest('article')) {
    return false;
  }

  const isMainHeading =
    element.closest('main, [role="main"]') !== null &&
    element.querySelector('h1, h2, h3') !== null;

  return !isMainHeading;
}

export function shouldSkipSubtree(element: HTMLElement): boolean {
  const role = element.getAttribute('role')?.toLowerCase();

  return (
    EXCLUDED_TAGS.has(element.tagName) ||
    EXCLUDED_LANDMARK_TAGS.has(element.tagName) ||
    isHeaderOutsideMainContent(element) ||
    (role !== undefined && EXCLUDED_ROLES.has(role)) ||
    element.hidden ||
    element.getAttribute('aria-hidden') === 'true' ||
    element.getAttribute('contenteditable') === 'true' ||
    element.matches(
      '[data-ds-extension-ui="true"], [data-ds-translation], .ds-translation, [data-deepseek-translated="true"], mjx-container',
    ) ||
    hasExcludedClass(element)
  );
}

function isInsideExcludedSubtree(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;

  while (current) {
    if (shouldSkipSubtree(current)) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

export function isElementVisible(
  element: HTMLElement,
  cache: VisibilityCache = new WeakMap(),
): boolean {
  const cached = cache.get(element);
  if (cached !== undefined) {
    return cached;
  }

  const uncachedAncestors: HTMLElement[] = [];
  let current: HTMLElement | null = element;

  while (current) {
    const ancestorCached = cache.get(current);
    if (ancestorCached !== undefined) {
      break;
    }
    uncachedAncestors.push(current);
    current = current.parentElement;
  }

  let visible = current ? (cache.get(current) ?? true) : true;
  for (let index = uncachedAncestors.length - 1; index >= 0; index -= 1) {
    const ancestor = uncachedAncestors[index]!;
    if (visible) {
      const view = ancestor.ownerDocument.defaultView;
      const style = view?.getComputedStyle(ancestor);
      visible =
        style?.display !== 'none' &&
        style?.visibility !== 'hidden' &&
        style?.visibility !== 'collapse';
    }
    cache.set(ancestor, visible);
  }

  return cache.get(element) ?? visible;
}

export function shouldTranslateElement(
  element: HTMLElement,
  visibilityCache?: VisibilityCache,
): boolean {
  return (
    !isInsideExcludedSubtree(element) &&
    element.closest('a') === null &&
    isElementVisible(element, visibilityCache)
  );
}
