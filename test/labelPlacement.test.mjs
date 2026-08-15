import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseLabelPlacement,
  fitLabelPlacement,
  labelCapsuleGeometry,
  labelPlacementCandidates,
} from '../public/app/labelPlacement.js';

test('label placement candidates expose stable bottom, right, top, and left anchors', () => {
  const candidates = labelPlacementCandidates({
    x: 100,
    y: 80,
    radius: 10,
    width: 60,
    fontSize: 12,
  });

  assert.deepEqual(candidates.map(({ anchor, align }) => [anchor, align]), [
    ['bottom', 'center'],
    ['right', 'left'],
    ['top', 'center'],
    ['left', 'right'],
  ]);
  assert.ok(candidates.every(({ rect }) => (
    rect.left < rect.right && rect.top < rect.bottom
  )));
});

test('label placement takes the first non-overlapping anchor', () => {
  const candidates = labelPlacementCandidates({
    x: 100,
    y: 80,
    radius: 10,
    width: 60,
    fontSize: 12,
  });
  const occupied = [{ ...candidates[0].rect }];

  assert.equal(chooseLabelPlacement(candidates, occupied).anchor, 'right');
  assert.equal(chooseLabelPlacement(candidates, []), candidates[0]);
  assert.equal(chooseLabelPlacement(candidates, candidates.map(({ rect }) => rect)), null);
  assert.equal(
    chooseLabelPlacement(candidates, candidates.map(({ rect }) => rect), { allowOverlap: true }).anchor,
    'bottom',
  );
});

test('label placement clamps the complete text box into the viewport', () => {
  const [placement] = labelPlacementCandidates({
    x: 8,
    y: 4,
    radius: 3,
    width: 80,
    fontSize: 13,
  });
  const fitted = fitLabelPlacement(placement, { width: 120, height: 80 });
  assert.equal(fitted.rect.left, 0);
  assert.ok(fitted.rect.top >= 0);
  assert.ok(fitted.rect.right <= 120);
  assert.ok(fitted.rect.bottom <= 80);
});

test('emphasis capsule expands a label box by bounded screen-space padding', () => {
  assert.deepEqual(labelCapsuleGeometry({
    left: 10,
    right: 70,
    top: 20,
    bottom: 38,
  }), {
    x: 5,
    y: 17,
    width: 70,
    height: 24,
    radius: 5,
  });
  assert.deepEqual(labelCapsuleGeometry({}), {
    x: -5,
    y: -3,
    width: 10,
    height: 6,
    radius: 3,
  });
});
