import { MESSAGE_TYPES, type ExtensionRequest } from '../types/message.ts';

export function isOptionsSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id &&
    sender.url === chrome.runtime.getURL('options.html');
}

export function isAllowedRequest(
  request: ExtensionRequest,
  sender: chrome.runtime.MessageSender,
): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  if (isOptionsSender(sender)) return true;
  if (request.type === MESSAGE_TYPES.GET_SETTINGS || request.type === MESSAGE_TYPES.TEST_API) {
    return false;
  }
  if (request.type === MESSAGE_TYPES.UPDATE_SETTINGS) {
    const allowed = new Set(['displayMode', 'floatingBall', 'autoTranslateSites', 'excludedSites']);
    return Object.keys(request.payload).every((key) => allowed.has(key));
  }
  return true;
}
