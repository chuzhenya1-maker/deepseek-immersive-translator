import { useEffect, useMemo, useState } from 'react';
import type { DisplayMode } from '../types/settings';
import type { TranslationRuntimeConfig } from '../types/message';
import type { TranslationTaskState } from '../types/translation';
import type { TranslationController } from '../content/translationController';
import type { SelectionTranslator } from '../content/selectionTranslator';
import {
  createSiteRuleUpdate,
  getSiteRule,
  type SiteTranslationRule,
} from '../services/siteRules';
import { sendExtensionMessage } from '../services/message';
import { MESSAGE_TYPES } from '../types/message';
import { FloatingBall } from './FloatingBall';
import { FloatingMenu } from './FloatingMenu';
import { SelectionActionButton } from './SelectionActionButton';
import { SelectionPopup } from './SelectionPopup';
import {
  calculateMenuPosition,
  clampPosition,
  type FloatingPosition,
} from './positioning';
import {
  calculateSelectionButtonPosition,
  calculateSelectionPopupPosition,
} from './selectionPositioning';

interface FloatingAppProps {
  controller: TranslationController;
  selectionTranslator: SelectionTranslator;
  config: TranslationRuntimeConfig;
  host: HTMLElement;
  onSavePosition: (position: FloatingPosition) => Promise<void>;
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function initialPosition(config: TranslationRuntimeConfig): FloatingPosition {
  const size = config.floatingBall.size;
  return clampPosition(
    {
      x: config.floatingBall.x ?? window.innerWidth - size - 20,
      y: config.floatingBall.y ?? (window.innerHeight - size) / 2,
    },
    size,
    viewport(),
  );
}

export function FloatingApp({
  controller,
  selectionTranslator,
  config,
  host,
  onSavePosition,
}: FloatingAppProps) {
  const [taskState, setTaskState] = useState<TranslationTaskState>(
    controller.getState(),
  );
  const [position, setPosition] = useState(() => initialPosition(config));
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(config.displayMode);
  const [toast, setToast] = useState<string | null>(null);
  const [selectionState, setSelectionState] = useState(
    selectionTranslator.getState(),
  );

  useEffect(() => controller.subscribe(setTaskState), [controller]);
  useEffect(
    () => selectionTranslator.subscribe(setSelectionState),
    [selectionTranslator],
  );
  useEffect(() => {
    selectionTranslator.setEnabled(config.selectionTranslation);
  }, [config.selectionTranslation, selectionTranslator]);

  useEffect(() => {
    const onResize = () => {
      setPosition((current) =>
        clampPosition(current, config.floatingBall.size, viewport()),
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [config.floatingBall.size]);

  useEffect(() => {
    if (!menuOpen && !selectionState.popupOpen) {
      return;
    }
    const closeOutside = (event: PointerEvent) => {
      if (!event.composedPath().includes(host)) {
        setMenuOpen(false);
        selectionTranslator.closePopup();
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        selectionTranslator.closePopup();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [host, menuOpen, selectionState.popupOpen, selectionTranslator]);

  useEffect(() => {
    if (selectionState.popupOpen) {
      setMenuOpen(false);
    }
  }, [selectionState.popupOpen]);

  useEffect(() => {
    if (taskState.status === 'idle') {
      return;
    }
    setToast(taskState.currentMessage ?? null);
    const timeout = window.setTimeout(
      () => setToast(null),
      taskState.status === 'error' ? 5_000 : 2_800,
    );
    return () => window.clearTimeout(timeout);
  }, [taskState.currentMessage, taskState.status]);

  useEffect(() => {
    setDisplayMode(config.displayMode);
  }, [config.displayMode]);

  const menuPosition = useMemo(
    () =>
      calculateMenuPosition(
        position,
        config.floatingBall.size,
        viewport(),
      ),
    [config.floatingBall.size, position],
  );
  const selectionButtonPosition = useMemo(
    () =>
      selectionState.actionSelection
        ? calculateSelectionButtonPosition(
            selectionState.actionSelection.rect,
            viewport(),
          )
        : undefined,
    [selectionState.actionSelection],
  );
  const selectionPopupPosition = useMemo(
    () =>
      selectionState.anchorRect
        ? calculateSelectionPopupPosition(selectionState.anchorRect, viewport())
        : undefined,
    [selectionState.anchorRect],
  );

  const changeDisplayMode = (mode: DisplayMode) => {
    setDisplayMode(mode);
    void controller.setDisplayMode(mode).catch((error: unknown) => {
      setToast(error instanceof Error ? error.message : '无法保存显示模式');
    });
  };
  const siteRule = getSiteRule(window.location.hostname, config);
  const changeSiteRule = (rule: SiteTranslationRule) => {
    const update = createSiteRuleUpdate(window.location.hostname, rule, config);
    if (!update) {
      setToast('无法识别当前网站');
      return;
    }
    void sendExtensionMessage({
      type: MESSAGE_TYPES.UPDATE_SETTINGS,
      payload: update,
    }).then((response) => {
      setToast(response.ok ? '本站设置已保存' : response.error);
    });
  };

  return (
    <>
      {config.floatingBall.enabled && (
        <FloatingBall
          position={position}
          size={config.floatingBall.size}
          opacity={config.floatingBall.opacity}
          status={taskState.status}
          progress={taskState.progress}
          onMove={setPosition}
          onCommitPosition={(nextPosition) => {
            void onSavePosition(nextPosition).catch(() => {
              setToast('无法保存悬浮球位置');
            });
          }}
          onToggleMenu={() => setMenuOpen((open) => !open)}
        />
      )}

      {menuOpen && (
        <FloatingMenu
          position={menuPosition}
          state={taskState}
          displayMode={displayMode}
          targetLanguage={config.targetLanguage}
          onStart={() => void controller.start()}
          onPause={() => controller.pause()}
          onResume={() => controller.resume()}
          onStop={() => void controller.stop()}
          onRestore={() => void controller.restore()}
          onDisplayMode={changeDisplayMode}
          onOpenSettings={() => void chrome.runtime.openOptionsPage()}
          siteRule={siteRule}
          onSiteRule={changeSiteRule}
        />
      )}

      {selectionButtonPosition && config.selectionTranslation && (
        <SelectionActionButton
          position={selectionButtonPosition}
          onTranslate={() => void selectionTranslator.translateSelection()}
        />
      )}

      {selectionState.popupOpen && (
        <SelectionPopup
          state={selectionState}
          position={selectionPopupPosition}
          targetLanguage={config.targetLanguage}
          onClose={() => selectionTranslator.closePopup()}
          onRetry={() => void selectionTranslator.retry()}
          onCopy={() => {
            void selectionTranslator.copyTranslation().then((copied) => {
              setToast(copied ? '已复制译文' : '复制失败，请手动复制');
            });
          }}
          onOpenSettings={() => void chrome.runtime.openOptionsPage()}
        />
      )}

      {toast && <div className="ds-toast" role="status">{toast}</div>}
    </>
  );
}
