import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlaceholderActionSlot } from '../public/app/placeholderAction.js';

test('placeholder action slot owns only the latest action and its dismiss policy', () => {
  const calls = [];
  const slot = createPlaceholderActionSlot();
  assert.deepEqual(slot.activate(), { handled: false, dismiss: false, result: undefined });

  slot.set(() => calls.push('search'), { dismiss: false });
  slot.set(() => calls.push('retry'), { dismiss: true });
  assert.deepEqual(slot.activate(), { handled: true, dismiss: true, result: 1 });
  assert.deepEqual(calls, ['retry']);

  slot.clear();
  assert.deepEqual(slot.activate(), { handled: false, dismiss: false, result: undefined });
});
