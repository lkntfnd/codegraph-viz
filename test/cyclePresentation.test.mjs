import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cycleMemberWindow } from '../public/app/cyclePresentation.js';

test('cycle member window keeps the selection visible and reports hidden evidence', () => {
  const members = Array.from({ length: 30 }, (_, index) => ({
    nodeId: String(index),
    label: `file-${String(index).padStart(2, '0')}`,
  }));
  const result = cycleMemberWindow(members, '29', { limit: 5 });

  assert.deepEqual(result.members.map(({ nodeId }) => nodeId), ['29', '0', '1', '2', '3']);
  assert.equal(result.hiddenCount, 25);
  assert.equal(result.expanded, false);
  assert.equal(result.canToggle, true);
});

test('expanded cycle member window returns complete defensive membership', () => {
  const members = [
    { nodeId: 'b', label: 'beta' },
    { nodeId: 'a', label: 'alpha' },
  ];
  const result = cycleMemberWindow(members, 'a', { expanded: true, limit: 1 });
  members[0].label = 'mutated';

  assert.deepEqual(result.members, [
    { nodeId: 'a', label: 'alpha' },
    { nodeId: 'b', label: 'beta' },
  ]);
  assert.equal(result.hiddenCount, 0);
  assert.equal(result.expanded, true);
  assert.equal(result.canToggle, true);
});
