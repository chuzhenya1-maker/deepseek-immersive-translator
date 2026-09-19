import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { NavigationObserver } from '../src/content/navigationObserver.ts';

test('navigation observer reports SPA history changes once and restores history', () => {
  const window = new Window({ url: 'https://example.com/a' });
  const changes: string[] = [];
  const originalPushState = window.history.pushState;
  const observer = new NavigationObserver(
    (url) => changes.push(url),
    window as unknown as globalThis.Window,
  );
  observer.start();
  observer.start();
  window.history.pushState({}, '', '/b');
  window.history.replaceState({}, '', '/c');
  assert.deepEqual(changes, ['https://example.com/b', 'https://example.com/c']);
  observer.stop();
  assert.equal(window.history.pushState, originalPushState);
});
