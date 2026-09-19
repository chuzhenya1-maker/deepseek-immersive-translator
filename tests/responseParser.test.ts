import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapTranslationResponse,
  parseTranslationResponse,
  stripMarkdownFence,
  TranslationResponseError,
} from '../src/background/responseParser.ts';

const requestedItems = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
];

test('parses a valid translation JSON object', () => {
  const parsed = parseTranslationResponse(
    '{"translations":[{"id":"a","translation":"甲"}]}',
  );
  assert.deepEqual(parsed.translations, [{ id: 'a', translation: '甲' }]);
});

test('removes an optional JSON Markdown fence only', () => {
  const raw = '```json\n{"translations":[{"id":"a","translation":"甲"}]}\n```';
  assert.equal(stripMarkdownFence(raw).startsWith('{'), true);
  assert.equal(parseTranslationResponse(raw).translations[0]?.id, 'a');
});

test('rejects missing translations, wrong types, and empty translations', () => {
  for (const raw of [
    '{}',
    '{"translations":"wrong"}',
    '{"translations":[{"id":"a","translation":""}]}',
  ]) {
    assert.throws(
      () => parseTranslationResponse(raw),
      TranslationResponseError,
    );
  }
});

test('rejects duplicate IDs', () => {
  assert.throws(
    () =>
      parseTranslationResponse(
        '{"translations":[{"id":"a","translation":"甲"},{"id":"a","translation":"乙"}]}',
      ),
    /重复/,
  );
});

test('maps reordered translations by ID rather than position', () => {
  const mapped = mapTranslationResponse(
    parseTranslationResponse(
      '{"translations":[{"id":"b","translation":"乙"},{"id":"a","translation":"甲"}]}',
    ),
    requestedItems,
  );

  assert.deepEqual(mapped.translations, [
    { id: 'a', translation: '甲' },
    { id: 'b', translation: '乙' },
  ]);
});

test('ignores unknown IDs without allowing them to replace missing IDs', () => {
  const parsed = parseTranslationResponse(
    '{"translations":[{"id":"b","translation":"乙"},{"id":"a","translation":"甲"},{"id":"unknown","translation":"未知"}]}',
  );
  const mapped = mapTranslationResponse(parsed, requestedItems);

  assert.deepEqual(mapped.unknownIds, ['unknown']);
  assert.equal(mapped.translations.length, 2);
});

test('reports a missing or modified ID as a missing translation', () => {
  const parsed = parseTranslationResponse(
    '{"translations":[{"id":"a-modified","translation":"甲"},{"id":"b","translation":"乙"}]}',
  );

  assert.throws(
    () => mapTranslationResponse(parsed, requestedItems),
    (error: unknown) =>
      error instanceof TranslationResponseError &&
      error.kind === 'MISSING_TRANSLATION' &&
      error.missingIds.includes('a'),
  );
});

test('does not attempt to repair prose around JSON', () => {
  assert.throws(
    () =>
      parseTranslationResponse(
        'Here is the result: {"translations":[{"id":"a","translation":"甲"}]}',
      ),
    TranslationResponseError,
  );
});
