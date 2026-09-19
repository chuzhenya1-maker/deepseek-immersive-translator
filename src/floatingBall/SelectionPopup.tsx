import type { SelectionTranslationState } from '../types/selection';
import type { FloatingPosition } from './positioning';

interface SelectionPopupProps {
  state: SelectionTranslationState;
  position?: FloatingPosition;
  targetLanguage: string;
  onClose: () => void;
  onRetry: () => void;
  onCopy: () => void;
  onOpenSettings: () => void;
}

export function SelectionPopup({
  state,
  position,
  targetLanguage,
  onClose,
  onRetry,
  onCopy,
  onOpenSettings,
}: SelectionPopupProps) {
  const corner = state.positionMode === 'corner';
  return (
    <section
      className={`ds-selection-popup${corner ? ' ds-selection-popup--corner' : ''}`}
      aria-label="选中文本翻译"
      style={corner || !position ? undefined : { left: position.x, top: position.y }}
    >
      <header>
        <div>
          <strong>DeepSeek 翻译</strong>
          <small>目标：{targetLanguage}</small>
        </div>
        <button type="button" aria-label="关闭选中文本翻译" onClick={onClose}>×</button>
      </header>

      {state.originalText && (
        <div className="ds-selection-copy">
          <span>原文</span>
          <p>{state.originalText}</p>
        </div>
      )}

      <div className="ds-selection-divider" />

      {state.status === 'loading' && (
        <div className="ds-selection-loading" role="status">
          <span />正在翻译…
        </div>
      )}
      {state.status === 'success' && (
        <div className="ds-selection-copy">
          <span>译文</span>
          <p>{state.translation}</p>
        </div>
      )}
      {state.status === 'error' && (
        <div className="ds-selection-error" role="alert">
          {state.error ?? '翻译失败'}
        </div>
      )}

      <footer>
        {state.status === 'success' && (
          <button type="button" className="ds-selection-primary" onClick={onCopy}>
            复制译文
          </button>
        )}
        {state.status === 'error' && state.originalText && (
          <button type="button" className="ds-selection-primary" onClick={onRetry}>
            重试
          </button>
        )}
        {state.status === 'error' && (
          <button type="button" onClick={onOpenSettings}>打开设置</button>
        )}
        <button type="button" onClick={onClose}>关闭</button>
      </footer>
    </section>
  );
}
