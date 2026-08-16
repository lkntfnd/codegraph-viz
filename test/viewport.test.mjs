import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cameraAfterViewportResize,
  graphIntersectsViewport,
  preserveViewportCenter,
} from '../public/app/viewport.js';

test('viewport resize preserves camera center and detects visible graph content', () => {
  const resized = preserveViewportCenter(
    { x: 100, y: 50, k: 2 },
    { width: 1_000, height: 800 },
    { width: 600, height: 400 },
  );

  assert.deepEqual(resized, { x: -100, y: -150, k: 2 });
  assert.equal(
    graphIntersectsViewport([{ x: 200, y: 150, radius: 5 }], resized, { width: 600, height: 400 }),
    true,
  );
  assert.equal(
    graphIntersectsViewport([{ x: 800, y: 600, radius: 5 }], resized, { width: 600, height: 400 }),
    false,
  );
});

test('viewport resize keeps an intentional off-graph camera target without requesting a fit', () => {
  const before = { x: -1_850, y: -1_225, k: 2.5 };
  const previousSize = { width: 1_440, height: 960 };
  const nextSize = { width: 375, height: 812 };
  const beforeWorldCenter = {
    x: (previousSize.width / 2 - before.x) / before.k,
    y: (previousSize.height / 2 - before.y) / before.k,
  };

  const after = cameraAfterViewportResize(before, previousSize, nextSize);

  assert.deepEqual({
    x: (nextSize.width / 2 - after.x) / after.k,
    y: (nextSize.height / 2 - after.y) / after.k,
  }, beforeWorldCenter);
});
