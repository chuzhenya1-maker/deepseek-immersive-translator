import type { DisplayMode } from '../types/settings';
import type { TranslationTaskState } from '../types/translation';
import type { FloatingPosition } from './positioning';
import { getFloatingMenuActions } from './uiState';
import type { SiteTranslationRule } from '../services/siteRules';

interface FloatingMenuProps {
  position: FloatingPosition;
  state: TranslationTaskState;
  displayMode: DisplayMode;
  targetLanguage: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestore: () => void;
  onDisplayMode: (mode: DisplayMode) => void;
  onOpenSettings: () => void;
  siteRule: SiteTranslationRule;
  onSiteRule: (rule: SiteTranslationRule) => void;
}

const MODE_LABELS: Record<DisplayMode, string> = {
  bilingual: '双语',
  'translation-only': '仅译文',
  'original-only': '仅原文',
};

export function FloatingMenu({
  position,
  state,
  displayMode,
  targetLanguage,
  onStart,
  onPause,
  onResume,
  onStop,
  onRestore,
  onDisplayMode,
  onOpenSettings,
  siteRule,
  onSiteRule,
}: FloatingMenuProps) {
  const actions = getFloatingMenuActions(state.status);

  return (
    <section
      className="ds-menu"
      aria-label="DeepSeek 翻译菜单"
      style={{ left: position.x, top: position.y }}
    >
      <header>
        <strong>DeepSeek 翻译</strong>
        <span className={`ds-status ds-status--${state.status}`}>
          {state.currentMessage ?? state.status}
        </span>
      </header>

      {(state.status === 'scanning' ||
        state.status === 'translating' ||
        state.status === 'paused' ||
        state.status === 'stopping' ||
        state.status === 'completed') && (
        <div className="ds-progress" aria-label={`翻译进度 ${Math.round(state.progress * 100)}%`}>
          <div className="ds-progress__track">
            <span style={{ width: `${Math.round(state.progress * 100)}%` }} />
          </div>
          <div className="ds-progress__text">
            <span>{state.translatedItems} / {state.totalItems} 段</span>
            <strong>{Math.round(state.progress * 100)}%</strong>
          </div>
          {state.failedItems > 0 && (
            <small>失败 {state.failedItems} 段</small>
          )}
        </div>
      )}

      <div className="ds-actions">
        {actions.includes('start') && (
          <button type="button" onClick={onStart}>
            {state.status === 'completed' ? '重新翻译' : state.status === 'error' ? '重试' : '翻译当前网页'}
          </button>
        )}
        {actions.includes('pause') && (
          <button type="button" onClick={onPause}>暂停</button>
        )}
        {actions.includes('resume') && (
          <button type="button" onClick={onResume}>继续</button>
        )}
        {actions.includes('stop') && (
          <button type="button" className="ds-button--danger" onClick={onStop}>停止</button>
        )}
        {actions.includes('restore') && (
          <button type="button" className="ds-button--secondary" onClick={onRestore}>
            恢复原文
          </button>
        )}
      </div>

      <div className="ds-field">
        <span>本站设置</span>
        <div className="ds-segmented">
          {(
            [
              ['default', '默认'],
              ['auto', '自动'],
              ['excluded', '排除'],
            ] as const
          ).map(([rule, label]) => (
            <button
              type="button"
              className={siteRule === rule ? 'is-active' : ''}
              aria-pressed={siteRule === rule}
              onClick={() => onSiteRule(rule)}
              key={rule}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="ds-field">
        <span>显示</span>
        <div className="ds-segmented">
          {(Object.keys(MODE_LABELS) as DisplayMode[]).map((mode) => (
            <button
              type="button"
              className={displayMode === mode ? 'is-active' : ''}
              aria-pressed={displayMode === mode}
              onClick={() => onDisplayMode(mode)}
              key={mode}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="ds-settings" onClick={onOpenSettings}>
        <span>目标：{targetLanguage}</span>
        <span>设置 ›</span>
      </button>
    </section>
  );
}
