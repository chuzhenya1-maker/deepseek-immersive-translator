import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateSelectionButtonPosition,
  calculateSelectionPopupPosition,
} from '../src/floatingBall/selectionPositioning.ts';

test('selection button stays near the range and inside viewport', () => {
  assert.deepEqual(
    calculateSelectionButtonPosition(
      { top: 2, right: 510, bottom: 20, left: 490, width: 20, height: 18 },
      { width: 500, height: 300 },
    ),
    { x: 460, y: 28 },
  );
});

test('selection popup flips above and remains inside a small viewport', () => {
  const position = calculateSelectionPopupPosition(
    { top: 560, right: 300, bottom: 590, left: 220, width: 80, height: 30 },
    { width: 600, height: 600 },
  );
  assert.equal(position.x >= 8 && position.x <= 192, true);
  assert.equal(position.y >= 8 && position.y <= 232, true);
});
