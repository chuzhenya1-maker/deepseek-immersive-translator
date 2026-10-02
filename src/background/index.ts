import { handleExtensionMessage, isExtensionRequest } from './messageHandler';
import { getSettings } from '../services/storage';
import { isAllowedRequest, isOptionsSender } from './messageSecurity';

// Fail closed: do not serve requests if trusted storage isolation fails.
const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
void storageReady.catch(() => console.error('Unable to restrict extension storage access.'));
import {
  handleSelectionContextMenuClick,
  syncSelectionContextMenu,
} from './contextMenu';

chrome.runtime.onInstalled.addListener(() => {
  void storageReady.then(() => Promise.all([getSettings(), syncSelectionContextMenu()])).catch(() => {
    console.error('[DeepSeek Immersive Translator] Failed to initialize settings.');
  });
});

chrome.runtime.onStartup.addListener(() => {
  void storageReady.then(() => syncSelectionContextMenu()).catch(() => undefined);
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === 'local') {
    void storageReady.then(() => syncSelectionContextMenu()).catch(() => undefined);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void storageReady.then(() => handleSelectionContextMenuClick(info, tab)).catch(() => undefined);
});

void storageReady.then(() => syncSelectionContextMenu()).catch(() => undefined);

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isExtensionRequest(message)) {
    return false;
  }

  if (!isAllowedRequest(message, sender)) {
    sendResponse({ ok: false, error: '此操作仅允许在扩展设置页执行' });
    return false;
  }

  void storageReady.then(() => handleExtensionMessage(message, isOptionsSender(sender)))
    .then(sendResponse)
    .catch(() => {
      sendResponse({ ok: false, error: '操作失败，请稍后重试' });
    });

  return true;
});
