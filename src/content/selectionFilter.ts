import { MAX_SELECTION_CHARACTERS } from '../types/selection.ts';

export type SelectionFilterResult =
  | 'valid'
  | 'empty'
  | 'too-long'
  | 'numeric'
  | 'symbol'
  | 'url'
  | 'code'
  | 'extension-ui';

const CODE_SELECTOR = [
  'code',
  'pre',
  '.monaco-editor',
  '.CodeMirror',
  '.hljs',
  '.prism',
  '[class*="language-"]',
].join(',');

function composedElement(node: Node | null): Element | null {
  if (!node) {
    return null;
  }
  return node instanceof Element ? node : node.parentElement;
}

function isInsideSelector(node: Node | null, selector: string): boolean {
  let element = composedElement(node);
  while (element) {
    if (element.closest(selector)) {
      return true;
    }
    const root = element.getRootNode();
    element = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}

export function filterSelectionText(text: string): SelectionFilterResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'empty';
  }
  if (trimmed.length > MAX_SELECTION_CHARACTERS) {
    return 'too-long';
  }
  if (/^(?:https?:\/\/|www\.)\S+$/iu.test(trimmed)) {
    return 'url';
  }
  if (/^[\d\s.,:%+\-–—/()]+$/u.test(trimmed)) {
    return 'numeric';
  }
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    return 'symbol';
  }
  return 'valid';
}

export function filterSelection(
  text: string,
  origin: Node | null,
): SelectionFilterResult {
  const textResult = filterSelectionText(text);
  if (textResult !== 'valid') {
    return textResult;
  }
  if (isInsideSelector(origin, '[data-ds-extension-ui="true"]')) {
    return 'extension-ui';
  }
  if (isInsideSelector(origin, CODE_SELECTOR)) {
    return 'code';
  }
  return 'valid';
}
