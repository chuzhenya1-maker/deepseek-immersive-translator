import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { scanDocumentWithStats } from '../src/content/domScanner.ts';
import { TranslationRenderer } from '../src/content/renderer.ts';
import { createBatches } from '../src/content/textBatcher.ts';
import { TranslationQueue } from '../src/content/translationQueue.ts';

interface RenderedFixture {
  document: Document;
  renderer: TranslationRenderer;
  sourceCount: number;
}

async function renderFixture(html: string): Promise<RenderedFixture> {
  const window = new Window();
  Object.assign(globalThis, {
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });
  window.document.write(`<!doctype html><html><head></head><body>${html}</body></html>`);
  window.document.close();
  const document = window.document as unknown as Document;
  const style = document.createElement('style');
  style.textContent = readFileSync(
    new URL('../public/content.css', import.meta.url),
    'utf8',
  );
  document.head.append(style);

  const scan = scanDocumentWithStats(document);
  const batches = createBatches(scan.nodes, {
    maxCharacters: 6_000,
    maxItems: 20,
  });
  const queue = new TranslationQueue(batches, scan.nodes, {
    taskId: 'fixture-task',
    targetLanguage: 'zh-CN',
    translationStyle: 'general',
    academicMode: false,
    preserveEnglishTerms: false,
    concurrency: 2,
    sleep: async () => undefined,
    sendBatch: async (payload) => ({
      batchId: payload.batchId,
      success: true,
      translations: payload.items.map((item) => ({
        id: item.id,
        translation: `中文：${item.text}`,
      })),
    }),
  });
  await queue.start();
  const renderer = new TranslationRenderer({ document });
  renderer.render(scan.nodes);
  return { document, renderer, sourceCount: scan.nodes.length };
}

test('Wikipedia-like article renders headings, paragraphs, lists, and captions', async () => {
  const fixture = await renderFixture(`
    <main>
      <h1>Translation</h1>
      <p>Translation communicates meaning from one language into another.</p>
      <ul><li>The source text remains available.</li></ul>
      <figure><img src="figure.png"><figcaption>A historical translation manuscript.</figcaption></figure>
    </main>
  `);

  assert.equal(fixture.sourceCount, 4);
  assert.equal(
    fixture.document.querySelectorAll('.ds-translation').length,
    fixture.sourceCount,
  );
  assert.equal(
    fixture.document.querySelector('li > .ds-translation') !== null,
    true,
  );
  fixture.renderer.setDisplayMode('translation-only');
  fixture.renderer.restoreOriginal();
  assert.equal(fixture.document.querySelectorAll('.ds-translation').length, 0);
  assert.equal(
    fixture.document.querySelectorAll('.ds-original-hidden').length,
    0,
  );
});

test('GitHub README-like dark page keeps code and links intact', async () => {
  const fixture = await renderFixture(`
    <main style="color: rgb(230, 237, 243); background: rgb(13, 17, 23)">
      <article class="markdown-body">
        <h1>Project documentation</h1>
        <p>Read the <a id="docs-link" href="#docs">installation documentation</a> before starting.</p>
        <pre><code id="code">npm run build</code></pre>
      </article>
    </main>
  `);
  const link = fixture.document.querySelector<HTMLAnchorElement>('#docs-link')!;
  const translation = fixture.document.querySelector<HTMLElement>(
    '.ds-translation',
  )!;

  assert.equal(fixture.sourceCount, 2);
  assert.equal(fixture.document.querySelector('#code')?.textContent, 'npm run build');
  assert.equal(link.getAttribute('href'), '#docs');
  assert.equal(
    fixture.document.defaultView?.getComputedStyle(translation).color,
    'rgb(230, 237, 243)',
  );
});

test('PMC-like academic page renders title, abstract, caption, and table cells safely', async () => {
  const fixture = await renderFixture(`
    <main>
      <article>
        <h1>Phosphorus limitation in terrestrial ecosystems</h1>
        <section>
          <h2>Abstract</h2>
          <p>This study evaluates nutrient limitation across multiple sites.</p>
          <figure><figcaption>Figure 1. Experimental design and sampling locations.</figcaption></figure>
          <table><thead><tr><th>Treatment group</th></tr></thead><tbody><tr><td>Phosphorus addition</td></tr></tbody></table>
        </section>
      </article>
    </main>
  `);

  assert.equal(fixture.sourceCount, 6);
  assert.equal(fixture.document.querySelectorAll('table').length, 1);
  assert.equal(fixture.document.querySelectorAll('tr').length, 2);
  assert.equal(fixture.document.querySelectorAll('th').length, 1);
  assert.equal(fixture.document.querySelectorAll('td').length, 1);
  assert.equal(
    fixture.document.querySelectorAll('th > .ds-translation').length,
    1,
  );
  assert.equal(
    fixture.document.querySelectorAll('td > .ds-translation').length,
    1,
  );
});
