import test from 'node:test';
import assert from 'node:assert/strict';

import { tabIndexAfterKey } from '../public/app/tabNavigation.js';

test('tab navigation wraps horizontal arrows and supports Home/End', () => {
  assert.equal(tabIndexAfterKey(0, 3, 'ArrowRight'), 1);
  assert.equal(tabIndexAfterKey(2, 3, 'ArrowRight'), 0);
  assert.equal(tabIndexAfterKey(0, 3, 'ArrowLeft'), 2);
  assert.equal(tabIndexAfterKey(1, 3, 'Home'), 0);
  assert.equal(tabIndexAfterKey(1, 3, 'End'), 2);
});

test('tab navigation ignores unrelated keys and empty collections', () => {
  assert.equal(tabIndexAfterKey(1, 3, 'Enter'), null);
  assert.equal(tabIndexAfterKey(0, 0, 'ArrowRight'), null);
});
