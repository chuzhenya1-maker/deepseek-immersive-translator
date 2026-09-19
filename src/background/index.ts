import { handleExtensionMessage, isExtensionRequest } from './messageHandler';
import { getSettings } from '../services/storage';
import {
  handleSelectionContextMenuClick,
  syncSelectionContextMenu,
} from './contextMenu';

chrome.runtime.onInstalled.addListener(() => {
  void Promise.all([getSettings(), syncSelectionContextMenu()]).catch(() => {
    console.error('[DeepSeek Immersive Translator] Failed to initialize settings.');
  });
});

chrome.runtime.onStartup.addListener(() => {
  void syncSelectionContextMenu().catch(() => undefined);
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === 'local') {
    void syncSelectionContextMenu().catch(() => undefined);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void handleSelectionContextMenuClick(info, tab).catch(() => undefined);
});

void syncSelectionContextMenu().catch(() => undefined);

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isExtensionRequest(message)) {
    return false;
  }

  void handleExtensionMessage(message)
    .then(sendResponse)
    .catch(() => {
      sendResponse({ ok: false, error: '操作失败，请稍后重试' });
    });

  return true;
});
