import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import {
  filterSelection,
  filterSelectionText,
} from '../src/content/selectionFilter.ts';

test('selection filter accepts natural and short technical text', () => {
  assert.equal(
    filterSelectionText('This study investigates phosphorus limitation.'),
    'valid',
  );
  assert.equal(filterSelectionText('photosystem II'), 'valid');
  assert.equal(filterSelectionText('AI'), 'valid');
  assert.equal(filterSelectionText('Paragraph 1\n\nParagraph 2'), 'valid');
});

test('selection filter rejects empty, numeric, URL, symbol, and oversized text', () => {
  assert.equal(filterSelectionText(''), 'empty');
  assert.equal(filterSelectionText('2026'), 'numeric');
  assert.equal(filterSelectionText('https://example.com'), 'url');
  assert.equal(filterSelectionText('— + →'), 'symbol');
  assert.equal(filterSelectionText('a'.repeat(10_001)), 'too-long');
});

test('selection filter excludes code and extension UI origins', () => {
  const window = new Window();
  Object.assign(globalThis, {
    Element: window.Element,
    ShadowRoot: window.ShadowRoot,
  });
  window.document.body.innerHTML = `
    <code id="code">const value = 10;</code>
    <div data-ds-extension-ui="true"><span id="ui">Popup text</span></div>
    <p id="article">Article text</p>
  `;
  assert.equal(
    filterSelection(
      'const value = 10;',
      window.document.querySelector('#code') as unknown as Node,
    ),
    'code',
  );
  assert.equal(
    filterSelection(
      'Popup text',
      window.document.querySelector('#ui') as unknown as Node,
    ),
    'extension-ui',
  );
  assert.equal(
    filterSelection(
      'Article text',
      window.document.querySelector('#article') as unknown as Node,
    ),
    'valid',
  );
});
