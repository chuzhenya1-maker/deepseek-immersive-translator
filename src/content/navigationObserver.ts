export type NavigationListener = (url: string, previousUrl: string) => void;

export class NavigationObserver {
  private readonly targetWindow: Window;
  private readonly listener: NavigationListener;
  private currentUrl: string;
  private started = false;
  private originalPushState: History['pushState'] | undefined;
  private originalReplaceState: History['replaceState'] | undefined;

  constructor(listener: NavigationListener, targetWindow: Window = window) {
    this.targetWindow = targetWindow;
    this.listener = listener;
    this.currentUrl = targetWindow.location.href;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.originalPushState = this.targetWindow.history.pushState;
    this.originalReplaceState = this.targetWindow.history.replaceState;
    const history = this.targetWindow.history;
    try {
      this.targetWindow.history.pushState = (...args) => {
        this.originalPushState!.apply(history, args);
        this.check();
      };
      this.targetWindow.history.replaceState = (...args) => {
        this.originalReplaceState!.apply(history, args);
        this.check();
      };
    } catch {
      try {
        if (this.originalPushState) {
          this.targetWindow.history.pushState = this.originalPushState;
        }
        if (this.originalReplaceState) {
          this.targetWindow.history.replaceState = this.originalReplaceState;
        }
      } catch {
        // popstate/hashchange listeners still provide safe basic navigation support.
      }
      this.originalPushState = undefined;
      this.originalReplaceState = undefined;
    }
    this.targetWindow.addEventListener('popstate', this.check);
    this.targetWindow.addEventListener('hashchange', this.check);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    if (this.originalPushState) {
      this.targetWindow.history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      this.targetWindow.history.replaceState = this.originalReplaceState;
    }
    this.targetWindow.removeEventListener('popstate', this.check);
    this.targetWindow.removeEventListener('hashchange', this.check);
  }

  private readonly check = (): void => {
    const nextUrl = this.targetWindow.location.href;
    if (nextUrl === this.currentUrl) {
      return;
    }
    const previousUrl = this.currentUrl;
    this.currentUrl = nextUrl;
    this.listener(nextUrl, previousUrl);
  };
}
