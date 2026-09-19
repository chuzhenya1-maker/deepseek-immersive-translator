import { createRoot, type Root } from 'react-dom/client';
import type { TranslationController } from '../content/translationController';
import type { SelectionTranslator } from '../content/selectionTranslator';
import { sendExtensionMessage } from '../services/message';
import { MESSAGE_TYPES, type TranslationRuntimeConfig } from '../types/message';
import { FloatingApp } from './FloatingApp';
import type { FloatingPosition } from './positioning';
import { createFloatingShadowHost } from './shadowHost';
import { FLOATING_UI_STYLES } from './styles';

export interface FloatingUiHandle {
  update(config: TranslationRuntimeConfig): void;
  unmount(): void;
}

export function mountFloatingUi(
  controller: TranslationController,
  selectionTranslator: SelectionTranslator,
  initialConfig: TranslationRuntimeConfig,
  targetDocument: Document = document,
): FloatingUiHandle | null {
  const shadowHost = createFloatingShadowHost(FLOATING_UI_STYLES, targetDocument);
  if (!shadowHost) {
    return null;
  }
  const { host, mountPoint } = shadowHost;
  const root: Root = createRoot(mountPoint);
  let config = initialConfig;

  const savePosition = async (position: FloatingPosition): Promise<void> => {
    const response = await sendExtensionMessage<unknown>({
      type: MESSAGE_TYPES.UPDATE_SETTINGS,
      payload: {
        floatingBall: { x: position.x, y: position.y },
      },
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
  };

  const render = (): void => {
    root.render(
      <FloatingApp
        controller={controller}
        selectionTranslator={selectionTranslator}
        config={config}
        host={host}
        onSavePosition={savePosition}
      />,
    );
  };
  render();

  return {
    update(nextConfig) {
      config = nextConfig;
      render();
    },
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}
