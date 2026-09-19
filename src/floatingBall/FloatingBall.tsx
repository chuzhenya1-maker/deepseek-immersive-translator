import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { TranslationTaskStatus } from '../types/translation';
import {
  clampPosition,
  exceededDragThreshold,
  type FloatingPosition,
} from './positioning';

interface FloatingBallProps {
  position: FloatingPosition;
  size: number;
  opacity: number;
  status: TranslationTaskStatus;
  progress: number;
  onMove: (position: FloatingPosition) => void;
  onCommitPosition: (position: FloatingPosition) => void;
  onToggleMenu: () => void;
}

interface DragState {
  pointerId: number;
  pointerStart: FloatingPosition;
  positionStart: FloatingPosition;
  currentPosition: FloatingPosition;
  dragged: boolean;
}

function statusLabel(status: TranslationTaskStatus, progress: number): string {
  switch (status) {
    case 'scanning':
    case 'stopping':
      return '…';
    case 'translating':
      return `${Math.round(progress * 100)}`;
    case 'paused':
      return 'Ⅱ';
    case 'completed':
      return '✓';
    case 'error':
      return '!';
    case 'stopped':
      return '■';
    default:
      return '译';
  }
}

export function FloatingBall({
  position,
  size,
  opacity,
  status,
  progress,
  onMove,
  onCommitPosition,
  onToggleMenu,
}: FloatingBallProps) {
  const drag = useRef<DragState | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      pointerStart: { x: event.clientX, y: event.clientY },
      positionStart: position,
      currentPosition: position,
      dragged: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    const pointer = { x: event.clientX, y: event.clientY };
    current.dragged ||= exceededDragThreshold(current.pointerStart, pointer);
    if (!current.dragged) {
      return;
    }
    event.preventDefault();
    current.currentPosition = clampPosition(
        {
          x: current.positionStart.x + pointer.x - current.pointerStart.x,
          y: current.positionStart.y + pointer.y - current.pointerStart.y,
        },
        size,
        { width: window.innerWidth, height: window.innerHeight },
      );
    onMove(current.currentPosition);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    drag.current = null;
    if (current.dragged) {
      onCommitPosition(current.currentPosition);
    } else {
      onToggleMenu();
    }
  };

  return (
    <button
      className={`ds-ball ds-ball--${status}`}
      type="button"
      aria-label="DeepSeek 翻译"
      title="DeepSeek 翻译"
      style={{
        left: position.x,
        top: position.y,
        width: size,
        height: size,
        opacity,
        '--ds-progress': `${Math.round(progress * 100)}%`,
      } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <span>{statusLabel(status, progress)}</span>
    </button>
  );
}
