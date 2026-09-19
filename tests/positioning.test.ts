import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateMenuPosition,
  clampPosition,
  exceededDragThreshold,
} from '../src/floatingBall/positioning.ts';

test('drag threshold distinguishes click from drag', () => {
  assert.equal(exceededDragThreshold({ x: 10, y: 10 }, { x: 13, y: 13 }), false);
  assert.equal(exceededDragThreshold({ x: 10, y: 10 }, { x: 16, y: 10 }), true);
});

test('clamps the floating ball inside the resized viewport', () => {
  assert.deepEqual(
    clampPosition({ x: 900, y: 700 }, 48, { width: 320, height: 240 }),
    { x: 264, y: 184 },
  );
  assert.deepEqual(
    clampPosition({ x: -50, y: -20 }, 48, { width: 320, height: 240 }),
    { x: 8, y: 8 },
  );
});

test('opens the menu on the available side and keeps it in the viewport', () => {
  assert.deepEqual(
    calculateMenuPosition({ x: 20, y: 100 }, 48, { width: 1000, height: 800 }),
    { x: 78, y: 100 },
  );
  assert.deepEqual(
    calculateMenuPosition({ x: 930, y: 760 }, 48, { width: 1000, height: 800 }),
    { x: 640, y: 402 },
  );
});
