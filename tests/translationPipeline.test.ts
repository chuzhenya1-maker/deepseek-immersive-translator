import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { scanDocumentWithStats } from '../src/content/domScanner.ts';
import { TranslationRenderer } from '../src/content/renderer.ts';
import { createBatches } from '../src/content/textBatcher.ts';
import { TranslationQueue } from '../src/content/translationQueue.ts';

test('scanner, batcher, queue, ID mapping, and renderer form one safe pipeline', async () => {
  const window = new Window();
  Object.assign(globalThis, {
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });
  window.document.write(`
    <!doctype html>
    <html><body><main>
      <h1>Research heading</h1>
      <p>First scientific paragraph.</p>
      <p>Second scientific paragraph.</p>
      <pre><code>const untranslated = true;</code></pre>
    </main></body></html>
  `);
  window.document.close();
  const document = window.document as unknown as Document;
  const scan = scanDocumentWithStats(document);
  const batches = createBatches(scan.nodes, {
    maxCharacters: 6_000,
    maxItems: 20,
  });
  let apiCalls = 0;
  const queue = new TranslationQueue(batches, scan.nodes, {
    taskId: 'pipeline-task',
    targetLanguage: 'zh-CN',
    translationStyle: 'academic',
    academicMode: true,
    preserveEnglishTerms: true,
    concurrency: 2,
    sleep: async () => undefined,
    sendBatch: async (payload) => {
      apiCalls += 1;
      return {
        batchId: payload.batchId,
        success: true,
        translations: [...payload.items].reverse().map((item) => ({
          id: item.id,
          translation: `中文：${item.text}`,
        })),
      };
    },
  });
  const progress = await queue.start();
  const renderer = new TranslationRenderer({
    document,
    displayMode: 'bilingual',
    targetLanguage: 'zh-CN',
  });
  renderer.render(scan.nodes);

  assert.equal(progress.translatedItems, 3);
  assert.equal(document.querySelectorAll('.ds-translation').length, 3);
  assert.equal(document.querySelector('code')?.textContent, 'const untranslated = true;');
  for (const node of scan.nodes) {
    const translation = Array.from(
      document.querySelectorAll<HTMLElement>('[data-ds-source-id]'),
    ).find((element) => element.getAttribute('data-ds-source-id') === node.id);
    assert.equal(translation?.textContent, `中文：${node.originalText}`);
  }

  const callsBeforeModeChanges = apiCalls;
  renderer.setDisplayMode('translation-only');
  renderer.setDisplayMode('original-only');
  renderer.setDisplayMode('bilingual');
  assert.equal(apiCalls, callsBeforeModeChanges);
  assert.equal(document.querySelectorAll('.ds-translation').length, 3);
});
