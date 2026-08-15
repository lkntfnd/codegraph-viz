import assert from 'node:assert/strict';
import test from 'node:test';

import { formatGraphCount } from '../public/app/graphCount.js';

test('graph count readout uses exact singular and plural nouns', () => {
  assert.equal(formatGraphCount({ visibleNodes: 1, totalNodes: 1, visibleLinks: 0 }), '1 node · 0 links');
  assert.equal(formatGraphCount({ visibleNodes: 2, totalNodes: 2, visibleLinks: 1 }), '2 nodes · 1 link');
  assert.equal(formatGraphCount({ visibleNodes: 1, totalNodes: 4, visibleLinks: 1 }), '1 of 4 nodes · 1 visible link');
  assert.equal(formatGraphCount({ visibleNodes: 1, totalNodes: 1, visibleLinks: 1, collapsed: true }), '1 of 1 node · 1 visible link');
});

test('graph count readout normalizes invalid counts defensively', () => {
  assert.equal(formatGraphCount({ visibleNodes: -1, totalNodes: 'bad', visibleLinks: Number.NaN }), '0 nodes · 0 links');
});
