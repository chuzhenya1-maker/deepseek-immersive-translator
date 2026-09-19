import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancelTranslationTask,
  getActiveRequestCount,
  isTranslationTaskCancelled,
  registerTranslationRequest,
  releaseTranslationRequest,
} from '../src/background/requestRegistry.ts';

test('cancels every active request for one task without affecting another', () => {
  const a1 = registerTranslationRequest('registry-task-a', 'batch-1');
  const a2 = registerTranslationRequest('registry-task-a', 'batch-2');
  const b1 = registerTranslationRequest('registry-task-b', 'batch-1');

  assert.equal(cancelTranslationTask('registry-task-a'), 2);
  assert.equal(a1.signal.aborted, true);
  assert.equal(a2.signal.aborted, true);
  assert.equal(b1.signal.aborted, false);
  assert.equal(isTranslationTaskCancelled('registry-task-a'), true);
  assert.equal(getActiveRequestCount('registry-task-a'), 0);

  const late = registerTranslationRequest('registry-task-a', 'late-batch');
  assert.equal(late.signal.aborted, true);
  releaseTranslationRequest('registry-task-b', 'batch-1');
  assert.equal(getActiveRequestCount('registry-task-b'), 0);
});
