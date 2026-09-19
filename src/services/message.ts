import type { ExtensionRequest, MessageResponse } from '../types/message';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMessageResponse<T>(value: unknown): value is MessageResponse<T> {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return false;
  }

  return value.ok ? 'data' in value : typeof value.error === 'string';
}

export function sendExtensionMessage<T>(
  message: ExtensionRequest,
): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: unknown) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        resolve({ ok: false, error: '扩展后台暂时不可用，请重新加载扩展' });
        return;
      }

      if (!isMessageResponse<T>(response)) {
        resolve({ ok: false, error: '扩展后台返回异常' });
        return;
      }

      resolve(response);
    });
  });
}
