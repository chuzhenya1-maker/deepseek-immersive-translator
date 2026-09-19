import type { SelectionRect } from '../types/selection';
import type { FloatingPosition, ViewportSize } from './positioning';

const MARGIN = 8;

export function calculateSelectionButtonPosition(
  rect: SelectionRect,
  viewport: ViewportSize,
  size = 32,
): FloatingPosition {
  const preferredTop = rect.top - size - MARGIN;
  const top = preferredTop >= MARGIN ? preferredTop : rect.bottom + MARGIN;
  return {
    x: Math.min(
      Math.max(MARGIN, rect.right - size),
      Math.max(MARGIN, viewport.width - size - MARGIN),
    ),
    y: Math.min(
      Math.max(MARGIN, top),
      Math.max(MARGIN, viewport.height - size - MARGIN),
    ),
  };
}

export function calculateSelectionPopupPosition(
  rect: SelectionRect,
  viewport: ViewportSize,
  width = Math.min(400, viewport.width - MARGIN * 2),
  estimatedHeight = Math.min(360, viewport.height - MARGIN * 2),
): FloatingPosition {
  const below = rect.bottom + 10;
  const above = rect.top - estimatedHeight - 10;
  const top =
    below + estimatedHeight <= viewport.height - MARGIN
      ? below
      : Math.max(MARGIN, above);
  return {
    x: Math.min(
      Math.max(MARGIN, rect.left),
      Math.max(MARGIN, viewport.width - width - MARGIN),
    ),
    y: Math.min(
      Math.max(MARGIN, top),
      Math.max(MARGIN, viewport.height - estimatedHeight - MARGIN),
    ),
  };
}
