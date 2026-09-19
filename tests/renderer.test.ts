import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { scanDocumentWithStats } from '../src/content/domScanner.ts';
import { TranslationRenderer } from '../src/content/renderer.ts';
import type { TranslationNode } from '../src/types/translation.ts';

function createPage(html: string): Document {
  const window = new Window();
  Object.assign(globalThis, {
    Node: window.Node,
    NodeFilter: window.NodeFilter,
  });
  window.document.write(`<!doctype html><html><head></head><body>${html}</body></html>`);
  window.document.close();
  return window.document as unknown as Document;
}

function translatedNode(
  element: HTMLElement,
  id: string,
  translation = `Translated ${id}`,
): TranslationNode {
  element.setAttribute('data-ds-node-id', id);
  return {
    id,
    element,
    originalText: element.textContent ?? '',
    translatedText: translation,
    status: 'translated',
  };
}

test('renders safely once, updates existing text, and never interprets HTML', () => {
  const document = createPage('<main><p id="source">Original text</p></main>');
  const source = document.querySelector<HTMLElement>('#source')!;
  const node = translatedNode(
    source,
    'node-1',
    '<img src=x onerror=alert(1)>Safe text',
  );
  const renderer = new TranslationRenderer({
    document,
    targetLanguage: 'zh-CN',
  });

  renderer.render([node]);
  renderer.render([node]);
  const translations = document.querySelectorAll(
    '[data-ds-translation="true"][data-ds-source-id="node-1"]',
  );

  assert.equal(translations.length, 1);
  assert.equal(translations[0]?.textContent, node.translatedText);
  assert.equal(translations[0]?.querySelector('img'), null);
  assert.equal(translations[0]?.getAttribute('lang'), 'zh-CN');
  assert.equal(source.textContent, 'Original text');

  node.translatedText = 'Updated translation';
  renderer.renderNode(node);
  assert.equal(translations[0]?.textContent, 'Updated translation');
  assert.equal(document.querySelectorAll('.ds-translation').length, 1);
});

test('uses safe placement for block, inline, list, and table sources', () => {
  const document = createPage(`
    <main>
      <p id="block">Block source</p>
      <span id="inline">Inline source</span>
      <ul><li id="list">List source</li></ul>
      <table><tbody><tr><td id="cell">Cell source</td><th id="header">Header source</th></tr></tbody></table>
    </main>
  `);
  const elements = ['block', 'inline', 'list', 'cell', 'header'].map(
    (id) => document.querySelector<HTMLElement>(`#${id}`)!,
  );
  const renderer = new TranslationRenderer({ document });
  renderer.render(
    elements.map((element, index) =>
      translatedNode(element, `node-${index + 1}`),
    ),
  );

  assert.equal(elements[0]?.nextElementSibling?.tagName, 'DIV');
  assert.equal(elements[1]?.nextElementSibling?.tagName, 'SPAN');
  assert.equal(elements[1]?.nextElementSibling?.getAttribute('data-ds-layout'), 'inline');
  assert.equal(elements[2]?.lastElementChild?.classList.contains('ds-translation'), true);
  assert.equal(elements[3]?.lastElementChild?.classList.contains('ds-translation'), true);
  assert.equal(elements[4]?.lastElementChild?.classList.contains('ds-translation'), true);
  assert.equal(document.querySelectorAll('li').length, 1);
  assert.equal(document.querySelectorAll('td').length, 1);
  assert.equal(document.querySelectorAll('th').length, 1);
});

test('skips failed, empty, and disconnected nodes without affecting others', () => {
  const document = createPage('<main><p id="a">Alpha</p><p id="b">Beta</p><p id="c">Gamma</p></main>');
  const elements = ['a', 'b', 'c'].map(
    (id) => document.querySelector<HTMLElement>(`#${id}`)!,
  );
  const failed = translatedNode(elements[0]!, 'failed');
  failed.status = 'failed';
  const empty = translatedNode(elements[1]!, 'empty', '   ');
  const disconnected = translatedNode(elements[2]!, 'detached');
  disconnected.element.remove();

  new TranslationRenderer({ document }).render([
    failed,
    empty,
    disconnected,
  ]);

  assert.equal(document.querySelectorAll('.ds-translation').length, 0);
});

test('switches display modes repeatedly without deleting or duplicating content', () => {
  const document = createPage('<main><p id="simple">Simple text</p><p id="complex">Text <button>Action</button></p></main>');
  const simple = document.querySelector<HTMLElement>('#simple')!;
  const complex = document.querySelector<HTMLElement>('#complex')!;
  const renderer = new TranslationRenderer({ document });
  renderer.render([
    translatedNode(simple, 'simple-node'),
    translatedNode(complex, 'complex-node'),
  ]);

  for (let index = 0; index < 20; index += 1) {
    renderer.setDisplayMode(
      ['bilingual', 'translation-only', 'original-only'][index % 3] as
        | 'bilingual'
        | 'translation-only'
        | 'original-only',
    );
  }

  renderer.setDisplayMode('translation-only');
  assert.equal(simple.classList.contains('ds-original-hidden'), true);
  assert.equal(simple.getAttribute('data-ds-original-hidden'), 'true');
  assert.equal(complex.classList.contains('ds-original-hidden'), false);

  renderer.setDisplayMode('original-only');
  assert.equal(simple.classList.contains('ds-original-hidden'), false);
  assert.equal(
    document.documentElement.getAttribute('data-ds-display-mode'),
    'original-only',
  );

  renderer.setDisplayMode('bilingual');
  assert.equal(document.querySelectorAll('.ds-translation').length, 2);
  assert.equal(simple.classList.contains('ds-original-hidden'), false);
});

test('restore is idempotent and cached nodes can be rendered again', () => {
  const document = createPage('<main><p id="source">Original</p></main>');
  const source = document.querySelector<HTMLElement>('#source')!;
  const node = translatedNode(source, 'node-restore', '译文');
  const renderer = new TranslationRenderer({ document });

  renderer.render([node]);
  renderer.setDisplayMode('translation-only');
  renderer.restoreOriginal();
  renderer.restoreOriginal();

  assert.equal(document.querySelectorAll('.ds-translation').length, 0);
  assert.equal(source.classList.contains('ds-original-hidden'), false);
  assert.equal(source.hasAttribute('data-ds-rendered'), false);
  assert.equal(
    document.documentElement.hasAttribute('data-ds-display-mode'),
    false,
  );

  renderer.render([node]);
  assert.equal(document.querySelectorAll('.ds-translation').length, 1);
  assert.equal(source.textContent, 'Original');
});

test('preserves existing event listeners and interactive descendants', () => {
  const document = createPage('<main><p id="source">Text <button id="button">Action</button></p></main>');
  const source = document.querySelector<HTMLElement>('#source')!;
  const button = document.querySelector<HTMLButtonElement>('#button')!;
  let clicks = 0;
  button.addEventListener('click', () => {
    clicks += 1;
  });
  const renderer = new TranslationRenderer({ document });

  renderer.render([translatedNode(source, 'interactive')]);
  renderer.setDisplayMode('translation-only');
  button.click();

  assert.equal(clicks, 1);
  assert.equal(document.querySelector('#button'), button);
  assert.equal(source.classList.contains('ds-original-hidden'), false);
});

test('scanner permanently excludes rendered translations', () => {
  const document = createPage('<main><p id="source">Original scientific paragraph.</p></main>');
  const source = document.querySelector<HTMLElement>('#source')!;
  const renderer = new TranslationRenderer({ document });
  renderer.render([
    translatedNode(source, 'scanner-node', 'Translated scientific paragraph.'),
  ]);

  const scan = scanDocumentWithStats(document);
  assert.deepEqual(
    scan.nodes.map((node) => node.originalText),
    ['Original scientific paragraph.'],
  );
});

test('rebinds a stable source ID when a framework replaces the source element', () => {
  const document = createPage('<main><p id="source">Original</p></main>');
  const original = document.querySelector<HTMLElement>('#source')!;
  const renderer = new TranslationRenderer({ document });
  renderer.render([translatedNode(original, 'stable-node', 'First translation')]);

  const replacement = document.createElement('p');
  replacement.id = 'replacement';
  replacement.textContent = 'Replacement original';
  original.replaceWith(replacement);
  const replacementNode = translatedNode(
    replacement,
    'stable-node',
    'Replacement translation',
  );
  renderer.render([replacementNode]);

  const translations = document.querySelectorAll(
    '[data-ds-source-id="stable-node"]',
  );
  assert.equal(translations.length, 1);
  assert.equal(translations[0]?.textContent, 'Replacement translation');
  assert.equal(replacement.nextElementSibling, translations[0]);
});

test('content styles are namespaced and inherit colors for dark pages', () => {
  const css = readFileSync(
    new URL('../public/content.css', import.meta.url),
    'utf8',
  );

  assert.match(css, /color:\s*inherit/);
  assert.match(css, /font:\s*inherit/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:div|p|span|\*)\s*\{/);
});
