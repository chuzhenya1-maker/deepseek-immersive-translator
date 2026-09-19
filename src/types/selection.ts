export const MAX_SELECTION_CHARACTERS = 10_000;

export interface SelectionRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

export interface TextSelection {
  id: string;
  text: string;
  rect: SelectionRect;
}

export type SelectionPopupPositionMode = 'selection' | 'corner';
export type SelectionTranslationStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error';

export interface SelectionTranslationState {
  status: SelectionTranslationStatus;
  actionSelection?: TextSelection;
  requestId?: string;
  originalText?: string;
  translation?: string;
  error?: string;
  popupOpen: boolean;
  positionMode: SelectionPopupPositionMode;
  anchorRect?: SelectionRect;
}

export type SelectionStateListener = (
  state: SelectionTranslationState,
) => void;
