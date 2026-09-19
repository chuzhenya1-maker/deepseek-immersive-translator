import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { Window } from 'happy-dom';
import { scanDocumentWithStats } from '../src/content/domScanner.ts';
import { createBatches } from '../src/content/textBatcher.ts';

test('scanner handles 1000 article paragraphs and batching prevents per-node requests', () => {
  const window = new Window();
  Object.assign(globalThis, { Node: window.Node, NodeFilter: window.NodeFilter });
  const main = window.document.createElement('main');
  for (let index = 0; index < 1_000; index += 1) {
    const paragraph = window.document.createElement('p');
    paragraph.textContent = `Scientific article paragraph ${index} contains enough natural language for translation.`;
    main.append(paragraph);
  }
  window.document.body.append(main);

  const startedAt = performance.now();
  const result = scanDocumentWithStats(window.document as unknown as Document);
  const elapsed = performance.now() - startedAt;
  const batches = createBatches(result.nodes, {
    maxCharacters: 6_000,
    maxItems: 20,
  });

  assert.equal(result.nodes.length, 1_000);
  assert.ok(elapsed < 5_000, `scan took ${elapsed.toFixed(1)} ms`);
  assert.ok(batches.length <= 50);
  assert.ok(batches.every((batch) => batch.items.length <= 20));
});

test('scanner completes a 5000-node long-page fixture without unbounded work', () => {
  const window = new Window();
  Object.assign(globalThis, { Node: window.Node, NodeFilter: window.NodeFilter });
  const main = window.document.createElement('main');
  const fragment = window.document.createDocumentFragment();
  for (let index = 0; index < 5_000; index += 1) {
    const paragraph = window.document.createElement('p');
    paragraph.textContent = `Long document paragraph ${index} contains stable natural language content.`;
    fragment.append(paragraph);
  }
  main.append(fragment);
  window.document.body.append(main);

  const startedAt = performance.now();
  const result = scanDocumentWithStats(window.document as unknown as Document);
  const elapsed = performance.now() - startedAt;
  assert.equal(result.nodes.length, 5_000);
  assert.ok(elapsed < 10_000, `scan took ${elapsed.toFixed(1)} ms`);
});
