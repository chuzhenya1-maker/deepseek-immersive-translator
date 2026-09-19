import type {
  BatchLimits,
  TranslationBatch,
  TranslationNode,
  TranslationRequestItem,
} from '../types/translation';

let nextBatchNumber = 1;

function createBatchId(): string {
  const id = `ds-batch-${String(nextBatchNumber).padStart(4, '0')}`;
  nextBatchNumber += 1;
  return id;
}

function validateLimits(limits: BatchLimits): void {
  if (!Number.isInteger(limits.maxItems) || limits.maxItems < 1) {
    throw new RangeError('maxItems must be a positive integer.');
  }

  if (!Number.isInteger(limits.maxCharacters) || limits.maxCharacters < 1) {
    throw new RangeError('maxCharacters must be a positive integer.');
  }
}

export function createBatches(
  nodes: readonly TranslationNode[],
  limits: BatchLimits,
  onOversizedNode?: (node: TranslationNode) => void,
): TranslationBatch[] {
  validateLimits(limits);

  const batches: TranslationBatch[] = [];
  let items: TranslationRequestItem[] = [];
  let characterCount = 0;

  const flush = () => {
    if (items.length === 0) {
      return;
    }

    batches.push({ id: createBatchId(), items, characterCount });
    items = [];
    characterCount = 0;
  };

  for (const node of nodes) {
    if (node.status === 'skipped') {
      continue;
    }

    const item = { id: node.id, text: node.originalText };
    const textLength = item.text.length;

    if (textLength > limits.maxCharacters) {
      flush();
      onOversizedNode?.(node);
      batches.push({
        id: createBatchId(),
        items: [item],
        characterCount: textLength,
      });
      continue;
    }

    if (
      items.length >= limits.maxItems ||
      characterCount + textLength > limits.maxCharacters
    ) {
      flush();
    }

    items.push(item);
    characterCount += textLength;
  }

  flush();
  return batches;
}
