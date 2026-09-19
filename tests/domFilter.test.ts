import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeText, shouldTranslateText } from '../src/content/domFilter.ts';

test('normal scientific text is translatable', () => {
  assert.equal(
    shouldTranslateText('This is a normal scientific paragraph.'),
    true,
  );
});

test('short article headings remain translatable', () => {
  for (const heading of [
    'Introduction',
    'Results',
    'Discussion',
    'Methods',
    'Abstract',
  ]) {
    assert.equal(shouldTranslateText(heading), true, heading);
  }
});

test('URLs, emails, numbers, paths, filenames, and symbols are filtered', () => {
  for (const text of [
    'https://example.com/test',
    'www.example.com',
    'test@example.com',
    '2026',
    '3.14159',
    'C:\\Users\\Test',
    '/usr/local/bin',
    'example.ts',
    '---',
    '***',
    '>>',
    'A',
    '1',
  ]) {
    assert.equal(shouldTranslateText(text), false, text);
  }
});

test('normalization trims and collapses whitespace', () => {
  assert.equal(normalizeText('  A\n\t normal   sentence.  '), 'A normal sentence.');
});
