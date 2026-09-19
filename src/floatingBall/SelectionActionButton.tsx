import type { FloatingPosition } from './positioning';

interface SelectionActionButtonProps {
  position: FloatingPosition;
  onTranslate: () => void;
}

export function SelectionActionButton({
  position,
  onTranslate,
}: SelectionActionButtonProps) {
  return (
    <button
      className="ds-selection-action"
      type="button"
      aria-label="翻译选中文本"
      title="翻译选中文本"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onTranslate}
    >
      译
    </button>
  );
}
