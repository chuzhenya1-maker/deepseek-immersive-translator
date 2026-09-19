import { scanDocumentWithStats } from './domScanner';
import { TranslationController } from './translationController';
import { SelectionTranslator } from './selectionTranslator';
import { DynamicContentObserver } from './observer';
import { NavigationObserver } from './navigationObserver';
import { getSiteRule } from '../services/siteRules';
import {
  mountFloatingUi,
  type FloatingUiHandle,
} from '../floatingBall/mount';
import { sendExtensionMessage } from '../services/message';
import {
  MESSAGE_TYPES,
  type RuntimeConfigChangedMessage,
  type SelectionContentMessage,
  type TranslationRuntimeConfig,
} from '../types/message';
import type { DisplayMode } from '../types/settings';
import type { TranslationTaskState } from '../types/translation';

const CONTENT_SCRIPT_FLAG = 'data-deepseek-translator-ready';
const DEBUG_MODE = import.meta.env.DEV || import.meta.env.MODE === 'development';

interface DomDebugSummary {
  scannedElements: number;
  candidates: number;
  filtered: number;
  translationNodes: number;
  totalCharacters: number;
}

declare global {
  interface Window {
    __deepSeekScan?: () => DomDebugSummary;
    __deepSeekTranslate?: () => Promise<void>;
    __deepSeekSetDisplayMode?: (mode: DisplayMode) => Promise<void>;
    __deepSeekRestoreOriginal?: () => Promise<void>;
    __deepSeekGetState?: () => TranslationTaskState | undefined;
  }
}

let controller: TranslationController | undefined;
let selectionTranslator: SelectionTranslator | undefined;
let floatingUi: FloatingUiHandle | null | undefined;
let dynamicObserver: DynamicContentObserver | undefined;
let navigationObserver: NavigationObserver | undefined;
let autoTranslateTriggeredUrl = '';

document.documentElement.setAttribute(CONTENT_SCRIPT_FLAG, 'true');

async function loadRuntimeConfig(): Promise<TranslationRuntimeConfig> {
  const response = await sendExtensionMessage<TranslationRuntimeConfig>({
    type: MESSAGE_TYPES.GET_TRANSLATION_CONFIG,
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

function applyRuntimeConfig(config: TranslationRuntimeConfig): void {
  if (!controller || !selectionTranslator) {
    return;
  }

  selectionTranslator.setEnabled(config.selectionTranslation);
  if (config.autoTranslateDynamicContent) {
    dynamicObserver?.start();
  } else {
    dynamicObserver?.stop();
  }
  if (
    !config.floatingBall.enabled &&
    !config.selectionTranslation &&
    !config.contextMenuTranslation
  ) {
    floatingUi?.unmount();
    floatingUi = undefined;
  } else if (floatingUi) {
    floatingUi.update(config);
  } else {
    floatingUi = mountFloatingUi(controller, selectionTranslator, config);
  }

  const siteRule = getSiteRule(window.location.hostname, config);
  if (siteRule !== 'auto') {
    autoTranslateTriggeredUrl = '';
  } else if (autoTranslateTriggeredUrl !== window.location.href) {
    autoTranslateTriggeredUrl = window.location.href;
    void controller.start('auto');
  }
}

async function initialize(): Promise<void> {
  if (window.top !== window.self) {
    return;
  }

  const config = await loadRuntimeConfig();
  controller = new TranslationController();
  selectionTranslator = new SelectionTranslator();
  selectionTranslator.setEnabled(config.selectionTranslation);
  selectionTranslator.start();
  dynamicObserver = new DynamicContentObserver({
    onNodes: (nodes) => controller?.translateIncremental(nodes),
  });
  navigationObserver = new NavigationObserver(() => {
    autoTranslateTriggeredUrl = '';
    dynamicObserver?.stop();
    void (async () => {
      await controller?.resetForNavigation();
      const nextConfig = await loadRuntimeConfig();
      applyRuntimeConfig(nextConfig);
    })().catch(() => undefined);
  });
  navigationObserver.start();
  applyRuntimeConfig(config);

  const handleRuntimeMessage = (
    message: unknown,
    sender: chrome.runtime.MessageSender,
  ): boolean => {
      if (
        sender.id === chrome.runtime.id &&
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type ===
          MESSAGE_TYPES.RUNTIME_CONFIG_CHANGED
      ) {
        applyRuntimeConfig((message as RuntimeConfigChangedMessage).payload);
      } else if (
        sender.id === chrome.runtime.id &&
        typeof message === 'object' &&
        message !== null &&
        ((message as { type?: unknown }).type ===
          MESSAGE_TYPES.SHOW_SELECTION_LOADING ||
          (message as { type?: unknown }).type ===
            MESSAGE_TYPES.SHOW_SELECTION_TRANSLATION)
      ) {
        selectionTranslator?.handleContentMessage(
          message as SelectionContentMessage,
        );
      }
    return false;
  };
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  const cleanup = (): void => {
    void controller?.stop();
    selectionTranslator?.stop();
    dynamicObserver?.stop();
    navigationObserver?.stop();
    floatingUi?.unmount();
    floatingUi = undefined;
    chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    window.removeEventListener('pagehide', cleanup);
  };
  window.addEventListener('pagehide', cleanup, { once: true });
}

function runDomScannerDebug(): DomDebugSummary {
  const result = scanDocumentWithStats();
  const summary: DomDebugSummary = {
    scannedElements: result.stats.scannedElements,
    candidates: result.stats.candidateElements,
    filtered: result.stats.filteredElements,
    translationNodes: result.stats.translationNodes,
    totalCharacters: result.stats.totalCharacters,
  };
  console.table(summary);
  return summary;
}

if (DEBUG_MODE) {
  window.__deepSeekScan = runDomScannerDebug;
  window.__deepSeekTranslate = async () => controller?.start();
  window.__deepSeekSetDisplayMode = async (mode) =>
    controller?.setDisplayMode(mode);
  window.__deepSeekRestoreOriginal = async () => controller?.restore();
  window.__deepSeekGetState = () => controller?.getState();
}

void initialize().catch((error: unknown) => {
  if (DEBUG_MODE) {
    console.error(
      '[DeepSeek Immersive Translator] Could not initialize content UI:',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
});
