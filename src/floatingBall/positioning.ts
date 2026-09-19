export interface FloatingPosition {
  x: number;
  y: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export function clampPosition(
  position: FloatingPosition,
  size: number,
  viewport: ViewportSize,
  margin = 8,
): FloatingPosition {
  return {
    x: Math.min(
      Math.max(margin, position.x),
      Math.max(margin, viewport.width - size - margin),
    ),
    y: Math.min(
      Math.max(margin, position.y),
      Math.max(margin, viewport.height - size - margin),
    ),
  };
}

export function exceededDragThreshold(
  start: FloatingPosition,
  current: FloatingPosition,
  threshold = 5,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function calculateMenuPosition(
  ball: FloatingPosition,
  ballSize: number,
  viewport: ViewportSize,
  menuWidth = 280,
  menuHeight = 390,
  margin = 10,
): FloatingPosition {
  const opensRight = ball.x < viewport.width / 2;
  const x = opensRight
    ? ball.x + ballSize + margin
    : ball.x - menuWidth - margin;
  return {
    x: Math.min(Math.max(8, x), Math.max(8, viewport.width - menuWidth - 8)),
    y: Math.min(
      Math.max(8, ball.y),
      Math.max(8, viewport.height - menuHeight - 8),
    ),
  };
}
