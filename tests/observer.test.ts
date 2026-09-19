import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { DynamicContentObserver } from '../src/content/observer.ts';
import type { TranslationNode } from '../src/types/translation.ts';

async function settle(delay = 20): Promise<void> {
  await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
}

test('observer starts once, debounces mutation bursts, and scans added roots', async () => {
  const window = new Window();
  Object.assign(globalThis, {
    Node: window.Node,
    NodeFilter: window.NodeFilter,
    MutationObserver: window.MutationObserver,
  });
  window.document.body.innerHTML = '<main id="root"></main>';
  const cycles: TranslationNode[][] = [];
  let scans = 0;
  const observer = new DynamicContentObserver({
    document: window.document as unknown as Document,
    debounceMs: 5,
    scan: (root) => {
      scans += 1;
      return [{
        id: root.id,
        element: root,
        originalText: root.textContent ?? '',
        status: 'pending',
      }];
    },
    onNodes: (nodes) => {
      cycles.push(nodes);
    },
  });
  observer.start();
  observer.start();
  const root = window.document.querySelector('#root')!;
  for (let index = 0; index < 100; index += 1) {
    const paragraph = window.document.createElement('p');
    paragraph.id = `p-${index}`;
    paragraph.textContent = `Paragraph ${index}`;
    root.append(paragraph);
  }
  await settle();
  assert.equal(cycles.length, 1);
  assert.equal(scans, 100);
  observer.stop();
  assert.equal(observer.isObserving, false);
});

test('observer ignores extension UI and rendered translation mutations', async () => {
  const window = new Window();
  Object.assign(globalThis, {
    Node: window.Node,
    NodeFilter: window.NodeFilter,
    MutationObserver: window.MutationObserver,
  });
  let scans = 0;
  const observer = new DynamicContentObserver({
    document: window.document as unknown as Document,
    debounceMs: 5,
    scan: () => {
      scans += 1;
      return [];
    },
    onNodes: () => undefined,
  });
  observer.start();
  const ui = window.document.createElement('div');
  ui.setAttribute('data-ds-extension-ui', 'true');
  const translation = window.document.createElement('div');
  translation.className = 'ds-translation';
  translation.setAttribute('data-ds-translation', 'true');
  window.document.body.append(ui, translation);
  await settle();
  assert.equal(scans, 0);
  observer.stop();
});
