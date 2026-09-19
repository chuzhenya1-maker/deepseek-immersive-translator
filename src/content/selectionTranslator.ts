import { sendExtensionMessage } from '../services/message.ts';
import {
  MESSAGE_TYPES,
  type SelectionContentMessage,
  type TranslateSelectionResult,
} from '../types/message.ts';
import type {
  SelectionStateListener,
  SelectionTranslationState,
} from '../types/selection';
import { detectTextSelection } from './selectionDetector.ts';

type SendSelectionRequest = (
  requestId: string,
  text: string,
) => Promise<{ ok: true; data: TranslateSelectionResult } | { ok: false; error: string }>;

export interface SelectionTranslatorDependencies {
  window?: Window;
  document?: Document;
  sendRequest?: SendSelectionRequest;
  createRequestId?: () => string;
  writeClipboard?: (text: string) => Promise<void>;
}

function initialState(): SelectionTranslationState {
  return {
    status: 'idle',
    popupOpen: false,
    positionMode: 'selection',
  };
}

async function sendSelectionRequest(
  requestId: string,
  text: string,
): ReturnType<SendSelectionRequest> {
  return sendExtensionMessage<TranslateSelectionResult>({
    type: MESSAGE_TYPES.TRANSLATE_SELECTION,
    payload: { requestId, text },
  });
}

export class SelectionTranslator {
  private readonly targetWindow: Window;
  private readonly targetDocument: Document;
  private readonly sendRequest: SendSelectionRequest;
  private readonly createRequestId: () => string;
  private readonly writeClipboard: (text: string) => Promise<void>;
  private readonly listeners = new Set<SelectionStateListener>();
  private state = initialState();
  private enabled = true;
  private started = false;
  private activeRequestId: string | undefined;

  constructor(dependencies: SelectionTranslatorDependencies = {}) {
    this.targetWindow = dependencies.window ?? window;
    this.targetDocument = dependencies.document ?? document;
    this.sendRequest = dependencies.sendRequest ?? sendSelectionRequest;
    this.createRequestId =
      dependencies.createRequestId ?? (() => `selection-${crypto.randomUUID()}`);
    this.writeClipboard =
      dependencies.writeClipboard ??
      ((text) => this.targetWindow.navigator.clipboard.writeText(text));
  }

  getState(): SelectionTranslationState {
    return {
      ...this.state,
      ...(this.state.actionSelection
        ? { actionSelection: { ...this.state.actionSelection, rect: { ...this.state.actionSelection.rect } } }
        : {}),
      ...(this.state.anchorRect ? { anchorRect: { ...this.state.anchorRect } } : {}),
    };
  }

  subscribe(listener: SelectionStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.targetDocument.addEventListener('pointerup', this.onPointerUp);
    this.targetWindow.addEventListener('scroll', this.hideAction, true);
    this.targetWindow.addEventListener('resize', this.hideAction);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.targetDocument.removeEventListener('pointerup', this.onPointerUp);
    this.targetWindow.removeEventListener('scroll', this.hideAction, true);
    this.targetWindow.removeEventListener('resize', this.hideAction);
    this.activeRequestId = undefined;
    this.state = initialState();
    this.emit();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.hideAction();
    }
  }

  async translateSelection(selection = this.state.actionSelection): Promise<void> {
    if (
      !selection ||
      (this.state.status === 'loading' &&
        this.state.originalText === selection.text)
    ) {
      return;
    }

    const requestId = this.createRequestId();
    this.activeRequestId = requestId;
    this.state = {
      status: 'loading',
      requestId,
      originalText: selection.text,
      popupOpen: true,
      positionMode: 'selection',
      anchorRect: selection.rect,
    };
    this.emit();

    const response = await this.sendRequest(requestId, selection.text);
    if (this.activeRequestId !== requestId || !this.state.popupOpen) {
      return;
    }
    this.state = response.ok
      ? {
          ...this.state,
          status: 'success',
          translation: response.data.translation,
          error: undefined,
        }
      : {
          ...this.state,
          status: 'error',
          translation: undefined,
          error: response.error,
        };
    this.emit();
  }

  retry(): Promise<void> {
    if (!this.state.originalText) {
      return Promise.resolve();
    }
    return this.translateSelection({
      id: this.createRequestId(),
      text: this.state.originalText,
      rect: this.state.anchorRect ?? {
        top: 16,
        right: 16,
        bottom: 16,
        left: 16,
        width: 0,
        height: 0,
      },
    });
  }

  closePopup(): void {
    this.activeRequestId = undefined;
    this.state = { ...initialState(), actionSelection: this.state.actionSelection };
    this.emit();
  }

  async copyTranslation(): Promise<boolean> {
    if (!this.state.translation) {
      return false;
    }
    try {
      await this.writeClipboard(this.state.translation);
      return true;
    } catch {
      return false;
    }
  }

  handleContentMessage(message: SelectionContentMessage): void {
    if (message.type === MESSAGE_TYPES.SHOW_SELECTION_LOADING) {
      this.activeRequestId = message.payload.requestId;
      this.state = {
        status: 'loading',
        requestId: message.payload.requestId,
        originalText: message.payload.originalText,
        popupOpen: true,
        positionMode: 'corner',
      };
      this.emit();
      return;
    }

    if (
      message.type !== MESSAGE_TYPES.SHOW_SELECTION_TRANSLATION ||
      this.activeRequestId !== message.payload.requestId ||
      !this.state.popupOpen
    ) {
      return;
    }
    this.state =
      message.payload.status === 'success'
        ? {
            ...this.state,
            status: 'success',
            translation: message.payload.translation,
            error: undefined,
          }
        : {
            ...this.state,
            status: 'error',
            translation: undefined,
            error: message.payload.error,
          };
    this.emit();
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.enabled || event.button !== 0) {
      return;
    }
    const path = event.composedPath();
    if (
      path.some(
        (item) =>
          item instanceof Element &&
          item.closest('[data-ds-extension-ui="true"]') !== null,
      )
    ) {
      return;
    }
    this.targetWindow.setTimeout(() => this.captureSelection(), 0);
  };

  private captureSelection(): void {
    const detection = detectTextSelection(this.targetWindow);
    if (detection.result === 'too-long') {
      this.activeRequestId = undefined;
      this.state = {
        status: 'error',
        error: '选中文本过长，请减少选择范围',
        popupOpen: true,
        positionMode: 'selection',
        ...(detection.rect ? { anchorRect: detection.rect } : {}),
      };
      this.emit();
      return;
    }
    if (!detection.selection) {
      this.hideAction();
      return;
    }
    this.state = { ...this.state, actionSelection: detection.selection };
    this.emit();
  }

  private readonly hideAction = (): void => {
    if (!this.state.actionSelection) {
      return;
    }
    const nextState = { ...this.state };
    delete nextState.actionSelection;
    this.state = nextState;
    this.emit();
  };

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
