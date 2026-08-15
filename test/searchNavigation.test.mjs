import test from 'node:test';
import assert from 'node:assert/strict';

import { searchIndexAfterKey } from '../public/app/searchNavigation.js';

test('search listbox arrows enter and clamp the active option', () => {
  assert.equal(searchIndexAfterKey(-1, 4, 'ArrowDown'), 0);
  assert.equal(searchIndexAfterKey(0, 4, 'ArrowDown'), 1);
  assert.equal(searchIndexAfterKey(3, 4, 'ArrowDown'), 3);
  assert.equal(searchIndexAfterKey(-1, 4, 'ArrowUp'), 3);
  assert.equal(searchIndexAfterKey(2, 4, 'ArrowUp'), 1);
  assert.equal(searchIndexAfterKey(0, 4, 'ArrowUp'), 0);
});

test('search listbox Home and End target boundaries', () => {
  assert.equal(searchIndexAfterKey(2, 4, 'Home'), 0);
  assert.equal(searchIndexAfterKey(1, 4, 'End'), 3);
});

test('search listbox navigation is defensive and ignores unrelated keys', () => {
  assert.equal(searchIndexAfterKey(2, 4, 'PageDown'), 2);
  assert.equal(searchIndexAfterKey(20, 4, 'ArrowUp'), 2);
  assert.equal(searchIndexAfterKey(0, 0, 'ArrowDown'), -1);
  assert.equal(searchIndexAfterKey(Number.NaN, 4, 'ArrowDown'), 0);
});
