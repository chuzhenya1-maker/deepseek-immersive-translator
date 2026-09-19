import { scanRoot } from './domScanner.ts';
import type { TranslationNode } from '../types/translation.ts';

export const DYNAMIC_TRANSLATION_DEBOUNCE_MS = 750;
export const MAX_DYNAMIC_NODES_PER_CYCLE = 200;

export interface DynamicContentObserverOptions {
  document?: Document;
  debounceMs?: number;
  onNodes: (nodes: TranslationNode[]) => void | Promise<void>;
  scan?: typeof scanRoot;
  setTimer?: typeof globalThis.setTimeout;
  clearTimer?: typeof globalThis.clearTimeout;
}

function isIgnoredElement(element: HTMLElement): boolean {
  return (
    element.matches(
      '[data-ds-extension-ui="true"], [data-ds-translation="true"], .ds-translation',
    ) ||
    element.closest(
      '[data-ds-extension-ui="true"], [data-ds-translation="true"], .ds-translation',
    ) !== null
  );
}

export class DynamicContentObserver {
  private readonly document: Document;
  private readonly debounceMs: number;
  private readonly onNodes: DynamicContentObserverOptions['onNodes'];
  private readonly scan: typeof scanRoot;
  private readonly setTimer: typeof globalThis.setTimeout;
  private readonly clearTimer: typeof globalThis.clearTimeout;
  private readonly pendingRoots = new Set<HTMLElement>();
  private observer: MutationObserver | undefined;
  private timer: ReturnType<typeof globalThis.setTimeout> | undefined;

  constructor(options: DynamicContentObserverOptions) {
    this.document = options.document ?? document;
    this.debounceMs = options.debounceMs ?? DYNAMIC_TRANSLATION_DEBOUNCE_MS;
    this.onNodes = options.onNodes;
    this.scan = options.scan ?? scanRoot;
    this.setTimer = options.setTimer ?? globalThis.setTimeout;
    this.clearTimer = options.clearTimer ?? globalThis.clearTimeout;
  }

  get isObserving(): boolean {
    return this.observer !== undefined;
  }

  start(): void {
    if (this.observer || !this.document.body) {
      return;
    }
    const ViewMutationObserver =
      this.document.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new ViewMutationObserver((mutations) => {
      this.collect(mutations);
    });
    this.observer.observe(this.document.body, { childList: true, subtree: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.pendingRoots.clear();
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
  }

  private collect(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        const root =
          addedNode.nodeType === Node.ELEMENT_NODE
            ? (addedNode as HTMLElement)
            : addedNode.nodeType === Node.TEXT_NODE
              ? addedNode.parentElement
              : null;
        if (!root || isIgnoredElement(root)) {
          continue;
        }
        this.pendingRoots.add(root);
      }
    }
    if (this.pendingRoots.size === 0) {
      return;
    }
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
    }
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      void this.flush();
    }, this.debounceMs);
  }

  private async flush(): Promise<void> {
    const roots = [...this.pendingRoots];
    this.pendingRoots.clear();
    const outerRoots = roots.filter(
      (root, index) =>
        !roots.some((candidate, candidateIndex) =>
          candidateIndex !== index && candidate.contains(root),
        ),
    );
    const byId = new Map<string, TranslationNode>();
    for (const root of outerRoots) {
      for (const node of this.scan(root)) {
        if (
          !node.element.hasAttribute('data-ds-rendered') &&
          !byId.has(node.id)
        ) {
          byId.set(node.id, node);
        }
      }
    }
    const nodes = [...byId.values()];
    for (let index = 0; index < nodes.length; index += MAX_DYNAMIC_NODES_PER_CYCLE) {
      await this.onNodes(nodes.slice(index, index + MAX_DYNAMIC_NODES_PER_CYCLE));
    }
  }
}
