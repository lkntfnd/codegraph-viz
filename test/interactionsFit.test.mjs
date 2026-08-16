import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  boundedFitScale,
  paddedViewportCenter,
  zoomScaleExtent,
} from '../public/app/interactions.js';

test('fit scale keeps the interaction floor unless an explicit overview floor is supplied', () => {
  assert.equal(boundedFitScale(0.05), 0.12);
  assert.equal(boundedFitScale(0.05, 0.02), 0.05);
  assert.equal(boundedFitScale(0.005, 0.02), 0.02);
  assert.equal(boundedFitScale(9, 0.02), 2.5);
});

test('wheel zoom can move smoothly around a programmatic overview scale', () => {
  const extent = zoomScaleExtent();
  assert.deepEqual(extent, [0.02, 6]);
  extent[0] = 99;
  assert.deepEqual(zoomScaleExtent(), [0.02, 6]);
});

test('selection centering uses the visible region left by inspector chrome', () => {
  assert.deepEqual(paddedViewportCenter(375, 686, {
    top: 48,
    right: 48,
    bottom: 397,
    left: 48,
  }), { x: 187.5, y: 168.5 });
  assert.deepEqual(paddedViewportCenter(1_440, 872, {
    top: 48,
    right: 342,
    bottom: 48,
    left: 48,
  }), { x: 573, y: 436 });
});
