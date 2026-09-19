import assert from 'node:assert/strict';
import test from 'node:test';
import { Window as HappyWindow } from 'happy-dom';
import { SelectionTranslator } from '../src/content/selectionTranslator.ts';
import { MESSAGE_TYPES } from '../src/types/message.ts';
import type { TextSelection } from '../src/types/selection.ts';

const RECT = { top: 100, right: 220, bottom: 130, left: 80, width: 140, height: 30 };

function selected(id: string, text: string): TextSelection {
  return { id, text, rect: RECT };
}

function fixture() {
  const window = new HappyWindow();
  const pending: Array<{
    requestId: string;
    text: string;
    resolve: (value: { ok: true; data: { requestId: string; translation: string } }) => void;
  }> = [];
  let requestNumber = 0;
  const translator = new SelectionTranslator({
    window: window as unknown as globalThis.Window,
    document: window.document as unknown as Document,
    createRequestId: () => `request-${++requestNumber}`,
    sendRequest: (requestId, text) =>
      new Promise((resolve) => pending.push({ requestId, text, resolve })),
  });
  return { translator, pending };
}

test('selection text is cached before the async translation request', async () => {
  const { translator, pending } = fixture();
  const run = translator.translateSelection(selected('selection-a', 'Original\ntext'));
  assert.equal(translator.getState().status, 'loading');
  assert.equal(pending[0]?.text, 'Original\ntext');
  pending[0]?.resolve({
    ok: true,
    data: { requestId: 'request-1', translation: '译文' },
  });
  await run;
  assert.equal(translator.getState().translation, '译文');
  assert.equal(translator.getState().originalText, 'Original\ntext');
});

test('newer selection request wins when an older response arrives late', async () => {
  const { translator, pending } = fixture();
  const first = translator.translateSelection(selected('a', 'Selection A'));
  const second = translator.translateSelection(selected('b', 'Selection B'));
  assert.equal(pending.length, 2);
  pending[1]?.resolve({
    ok: true,
    data: { requestId: 'request-2', translation: '结果 B' },
  });
  await second;
  pending[0]?.resolve({
    ok: true,
    data: { requestId: 'request-1', translation: '结果 A' },
  });
  await first;
  assert.equal(translator.getState().originalText, 'Selection B');
  assert.equal(translator.getState().translation, '结果 B');
});

test('rapid duplicate clicks for the same selection send one request', async () => {
  const { translator, pending } = fixture();
  const selection = selected('a', 'Same selection');
  const first = translator.translateSelection(selection);
  const duplicate = translator.translateSelection(selection);
  assert.equal(pending.length, 1);
  pending[0]?.resolve({
    ok: true,
    data: { requestId: 'request-1', translation: '译文' },
  });
  await Promise.all([first, duplicate]);
  assert.equal(translator.getState().translation, '译文');
});

test('closing a loading popup prevents its late response from reopening', async () => {
  const { translator, pending } = fixture();
  const run = translator.translateSelection(selected('a', 'Selection A'));
  translator.closePopup();
  pending[0]?.resolve({
    ok: true,
    data: { requestId: 'request-1', translation: '迟到结果' },
  });
  await run;
  assert.equal(translator.getState().popupOpen, false);
  assert.equal(translator.getState().translation, undefined);
});

test('copy writes only the translated text and reports clipboard failure', async () => {
  const copied: string[] = [];
  const window = new HappyWindow();
  const domDependencies = {
    window: window as unknown as globalThis.Window,
    document: window.document as unknown as Document,
  };
  const translator = new SelectionTranslator({
    ...domDependencies,
    writeClipboard: async (text) => {
      copied.push(text);
    },
    sendRequest: async (requestId) => ({
      ok: true,
      data: { requestId, translation: 'Only translation' },
    }),
  });
  await translator.translateSelection(selected('a', 'Original'));
  assert.equal(await translator.copyTranslation(), true);
  assert.deepEqual(copied, ['Only translation']);

  const failing = new SelectionTranslator({
    ...domDependencies,
    writeClipboard: async () => Promise.reject(new Error('denied')),
    sendRequest: async (requestId) => ({
      ok: true,
      data: { requestId, translation: '译文' },
    }),
  });
  await failing.translateSelection(selected('b', 'Original'));
  assert.equal(await failing.copyTranslation(), false);
});

test('context-menu messages use latest request id and respect close', () => {
  const { translator } = fixture();
  translator.handleContentMessage({
    type: MESSAGE_TYPES.SHOW_SELECTION_LOADING,
    payload: { requestId: 'context-a', originalText: 'A' },
  });
  translator.handleContentMessage({
    type: MESSAGE_TYPES.SHOW_SELECTION_LOADING,
    payload: { requestId: 'context-b', originalText: 'B' },
  });
  translator.handleContentMessage({
    type: MESSAGE_TYPES.SHOW_SELECTION_TRANSLATION,
    payload: {
      requestId: 'context-a',
      originalText: 'A',
      status: 'success',
      translation: '旧结果',
    },
  });
  assert.equal(translator.getState().originalText, 'B');
  translator.closePopup();
  translator.handleContentMessage({
    type: MESSAGE_TYPES.SHOW_SELECTION_TRANSLATION,
    payload: {
      requestId: 'context-b',
      originalText: 'B',
      status: 'success',
      translation: '关闭后结果',
    },
  });
  assert.equal(translator.getState().popupOpen, false);
});
