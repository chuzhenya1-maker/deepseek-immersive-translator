import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import {
  createFloatingShadowHost,
  FLOATING_ROOT_ID,
} from '../src/floatingBall/shadowHost.ts';
import { getFloatingMenuActions } from '../src/floatingBall/uiState.ts';

test('floating menu exposes only actions valid for the task state', () => {
  assert.deepEqual(getFloatingMenuActions('translating'), [
    'pause',
    'stop',
    'restore',
  ]);
  assert.deepEqual(getFloatingMenuActions('paused'), [
    'resume',
    'stop',
    'restore',
  ]);
  assert.deepEqual(getFloatingMenuActions('completed'), ['start', 'restore']);
  assert.deepEqual(getFloatingMenuActions('stopping'), ['restore']);
});

test('floating UI host mounts once in an open Shadow DOM', () => {
  const window = new Window();
  window.document.write(
    '<!doctype html><html><body><main>Article</main></body></html>',
  );
  window.document.close();
  const document = window.document as unknown as Document;

  const first = createFloatingShadowHost(':host { all: initial; }', document);
  assert.notEqual(first, null);
  for (let index = 0; index < 9; index += 1) {
    assert.equal(createFloatingShadowHost('', document), null);
  }

  const host = document.getElementById(FLOATING_ROOT_ID);
  assert.equal(host?.getAttribute('data-ds-extension-ui'), 'true');
  assert.notEqual(host?.shadowRoot, null);
  assert.equal(host?.shadowRoot?.querySelectorAll('style').length, 1);
  assert.equal(document.querySelectorAll(`#${FLOATING_ROOT_ID}`).length, 1);
  assert.equal(document.body.querySelectorAll('style').length, 0);

  first?.host.remove();
  assert.equal(document.getElementById(FLOATING_ROOT_ID), null);
});
