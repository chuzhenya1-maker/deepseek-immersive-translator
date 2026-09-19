import assert from 'node:assert/strict';
import test from 'node:test';
import { createBatches } from '../src/content/textBatcher.ts';
import type { TranslationNode } from '../src/types/translation.ts';

function createNode(
  index: number,
  text = `Text ${index}`,
  status: TranslationNode['status'] = 'pending',
): TranslationNode {
  return {
    id: `node-${index}`,
    element: {} as HTMLElement,
    originalText: text,
    status,
  };
}

test('empty input produces no batches', () => {
  assert.deepEqual(
    createBatches([], { maxCharacters: 6_000, maxItems: 20 }),
    [],
  );
});

test('more than 20 items starts another batch', () => {
  const nodes = Array.from({ length: 21 }, (_, index) => createNode(index));
  const batches = createBatches(nodes, {
    maxCharacters: 6_000,
    maxItems: 20,
  });

  assert.equal(batches.length, 2);
  assert.equal(batches[0]?.items.length, 20);
  assert.equal(batches[1]?.items.length, 1);
});

test('character limit starts another batch and preserves order', () => {
  const batches = createBatches(
    [createNode(1, 'abcd'), createNode(2, 'efgh')],
    { maxCharacters: 7, maxItems: 20 },
  );

  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.flatMap((batch) => batch.items.map((item) => item.id)),
    ['node-1', 'node-2'],
  );
});

test('an oversized node receives a dedicated batch', () => {
  let oversizedNodeId = '';
  const batches = createBatches(
    [createNode(1, 'short'), createNode(2, 'x'.repeat(11)), createNode(3, 'end')],
    { maxCharacters: 10, maxItems: 20 },
    (node) => {
      oversizedNodeId = node.id;
    },
  );

  assert.equal(batches.length, 3);
  assert.equal(batches[1]?.characterCount, 11);
  assert.equal(oversizedNodeId, 'node-2');
});

test('skipped nodes are not included', () => {
  const batches = createBatches(
    [createNode(1), createNode(2, 'Skipped text', 'skipped')],
    { maxCharacters: 6_000, maxItems: 20 },
  );

  assert.deepEqual(batches[0]?.items.map((item) => item.id), ['node-1']);
});
