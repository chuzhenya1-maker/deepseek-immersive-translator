import type { TranslationTaskStatus } from '../types/translation';

export type FloatingMenuAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'restore';

export function getFloatingMenuActions(
  status: TranslationTaskStatus,
): FloatingMenuAction[] {
  switch (status) {
    case 'scanning':
      return ['stop', 'restore'];
    case 'translating':
      return ['pause', 'stop', 'restore'];
    case 'paused':
      return ['resume', 'stop', 'restore'];
    case 'stopping':
      return ['restore'];
    default:
      return ['start', 'restore'];
  }
}
