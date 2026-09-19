export const FLOATING_ROOT_ID = 'deepseek-translator-root';

export interface FloatingShadowHost {
  host: HTMLDivElement;
  mountPoint: HTMLDivElement;
}

export function createFloatingShadowHost(
  styles: string,
  documentRef: Document = document,
): FloatingShadowHost | null {
  if (documentRef.getElementById(FLOATING_ROOT_ID)) {
    return null;
  }

  const host = documentRef.createElement('div');
  host.id = FLOATING_ROOT_ID;
  host.setAttribute('data-ds-extension-ui', 'true');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = documentRef.createElement('style');
  style.textContent = styles;
  const mountPoint = documentRef.createElement('div');
  shadowRoot.append(style, mountPoint);
  documentRef.documentElement.append(host);

  return { host, mountPoint };
}
