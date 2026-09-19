import type { SelectionRect, TextSelection } from '../types/selection';
import { filterSelection, type SelectionFilterResult } from './selectionFilter.ts';

export interface SelectionDetection {
  result: SelectionFilterResult;
  selection?: TextSelection;
  rect?: SelectionRect;
}

function copyRect(rect: DOMRect): SelectionRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

export function detectTextSelection(
  targetWindow: Window = window,
  createId: () => string = () => `selection-${crypto.randomUUID()}`,
): SelectionDetection {
  const browserSelection = targetWindow.getSelection();
  if (
    !browserSelection ||
    browserSelection.rangeCount === 0 ||
    browserSelection.isCollapsed
  ) {
    return { result: 'empty' };
  }

  const text = browserSelection.toString().trim();
  const range = browserSelection.getRangeAt(0);
  const result = filterSelection(text, range.commonAncestorContainer);
  const rect = copyRect(range.getBoundingClientRect());
  if (result !== 'valid') {
    return { result, rect };
  }

  return {
    result,
    rect,
    selection: { id: createId(), text, rect },
  };
}
