import { getSettings } from '../services/storage.ts';
import { MESSAGE_TYPES, type SelectionContentMessage } from '../types/message.ts';
import {
  getSelectionErrorMessage,
  translateSelectionText,
} from './selectionTranslation.ts';

export const SELECTION_CONTEXT_MENU_ID = 'deepseek-translate-selection';

async function removeSelectionMenu(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.contextMenus.remove(SELECTION_CONTEXT_MENU_ID, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

export async function syncSelectionContextMenu(): Promise<void> {
  const settings = await getSettings();
  await removeSelectionMenu();
  if (!settings.contextMenuTranslation) {
    return;
  }
  chrome.contextMenus.create({
    id: SELECTION_CONTEXT_MENU_ID,
    title: '使用 DeepSeek 翻译',
    contexts: ['selection'],
  });
}

async function sendToTab(
  tabId: number,
  message: SelectionContentMessage,
): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch {
    // Restricted pages or missing content scripts must fail silently.
    return false;
  }
}

export async function handleSelectionContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (
    info.menuItemId !== SELECTION_CONTEXT_MENU_ID ||
    tab?.id === undefined ||
    !info.selectionText?.trim()
  ) {
    return;
  }
  const settings = await getSettings();
  if (!settings.contextMenuTranslation) {
    return;
  }

  const requestId = `selection-${crypto.randomUUID()}`;
  const originalText = info.selectionText.trim();
  const canDisplayResult = await sendToTab(tab.id, {
    type: MESSAGE_TYPES.SHOW_SELECTION_LOADING,
    payload: { requestId, originalText },
  });
  if (!canDisplayResult) {
    return;
  }

  try {
    const result = await translateSelectionText({ requestId, text: originalText });
    await sendToTab(tab.id, {
      type: MESSAGE_TYPES.SHOW_SELECTION_TRANSLATION,
      payload: {
        requestId,
        originalText,
        status: 'success',
        translation: result.translation,
      },
    });
  } catch (error: unknown) {
    await sendToTab(tab.id, {
      type: MESSAGE_TYPES.SHOW_SELECTION_TRANSLATION,
      payload: {
        requestId,
        originalText,
        status: 'error',
        error: getSelectionErrorMessage(error),
      },
    });
  }
}
