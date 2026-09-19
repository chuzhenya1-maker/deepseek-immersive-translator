import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { scanDocumentWithStats } from '../src/content/domScanner.ts';

function createDocument(html: string): Document {
  const window = new Window();
  Object.assign(globalThis, {
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });
  window.document.write(html);
  window.document.close();
  return window.document as unknown as Document;
}

test('scanner keeps article text in DOM order without parent duplicates', () => {
  const document = createDocument(`
    <!doctype html>
    <html>
      <body>
        <nav><p>Navigation item should be ignored</p></nav>
        <main>
          <header><h1>Page main heading</h1></header>
          <article>
            <header><h1>Research article title</h1></header>
            <div><p>First scientific paragraph with useful content.</p></div>
            <p>Second paragraph with <strong>important terms</strong>.</p>
          </article>
        </main>
        <footer><p>Footer tools should be ignored</p></footer>
      </body>
    </html>
  `);

  const result = scanDocumentWithStats(document);
  assert.deepEqual(
    result.nodes.map((node) => node.originalText),
    [
      'Page main heading',
      'Research article title',
      'First scientific paragraph with useful content.',
      'Second paragraph with important terms.',
    ],
  );
  assert.equal(new Set(result.nodes.map((node) => node.id)).size, 4);
});

test('scanner skips code, formulas, hidden content, translations, and extension UI', () => {
  const document = createDocument(`
    <!doctype html>
    <html>
      <body>
        <main>
          <p>Visible paragraph before exclusions.</p>
          <pre><code>const secret = true;</code></pre>
          <div class="highlight">function ignored() { return true; }</div>
          <div class="monaco-editor"><span>Editor content ignored</span></div>
          <div class="katex">x = y + 1</div>
          <mjx-container><span>Formula content ignored</span></mjx-container>
          <p hidden>Hidden attribute content ignored.</p>
          <p aria-hidden="true">ARIA hidden content ignored.</p>
          <div style="display: none"><p>CSS hidden content ignored.</p></div>
          <div data-ds-extension-ui="true"><p>Extension menu ignored.</p></div>
          <div class="ds-translation">Existing translation ignored.</div>
          <span>Standalone inline text remains available.</span>
        </main>
      </body>
    </html>
  `);

  const texts = scanDocumentWithStats(document).nodes.map(
    (node) => node.originalText,
  );
  assert.deepEqual(texts, [
    'Visible paragraph before exclusions.',
    'Standalone inline text remains available.',
  ]);
});

test('a hidden child does not mark visible sibling content as hidden in the cache', () => {
  const document = createDocument(`
    <main>
      <div style="display: none"><p>Hidden paragraph should be skipped.</p></div>
      <p>Visible sibling paragraph remains available for translation.</p>
    </main>
  `);

  const result = scanDocumentWithStats(document);
  assert.deepEqual(
    result.nodes.map((node) => node.originalText),
    ['Visible sibling paragraph remains available for translation.'],
  );
});

test('scanner reuses stable element IDs and does not change text content', () => {
  const document = createDocument(`
    <!doctype html>
    <html><body><main><p>Stable paragraph content.</p></main></body></html>
  `);
  const before = document.body.textContent;
  const first = scanDocumentWithStats(document).nodes;
  const second = scanDocumentWithStats(document).nodes;

  assert.equal(first[0]?.id, second[0]?.id);
  assert.equal(document.body.textContent, before);
  assert.equal(document.querySelectorAll('.ds-translation').length, 0);
});
