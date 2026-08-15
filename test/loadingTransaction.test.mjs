import test from 'node:test';
import assert from 'node:assert/strict';

import { createLoadingTransaction } from '../public/app/loadingTransaction.js';

function harness() {
  let nextTimer = 0;
  const callbacks = new Map();
  const shown = [];
  let hides = 0;
  const transaction = createLoadingTransaction({
    delay: 120,
    show: (copy) => shown.push(copy),
    hide: () => { hides += 1; },
    schedule: (callback, delay) => {
      const id = ++nextTimer;
      callbacks.set(id, { callback, delay });
      return id;
    },
    cancel: (id) => callbacks.delete(id),
  });
  return { transaction, callbacks, shown, hides: () => hides };
}

test('loading transaction delays its veil and cancels fast work without flicker', () => {
  const { transaction, callbacks, shown, hides } = harness();
  const ticket = transaction.begin({ title: 'Mapping architecture' });
  assert.equal([...callbacks.values()][0].delay, 120);
  assert.deepEqual(shown, []);

  transaction.finish(ticket);
  assert.equal(callbacks.size, 0);
  assert.deepEqual(shown, []);
  assert.equal(hides(), 0);
});

test('a newer transaction owns the visible veil and stale completion cannot hide it', () => {
  const { transaction, callbacks, shown, hides } = harness();
  const first = transaction.begin({ title: 'First' });
  callbacks.values().next().value.callback();
  assert.deepEqual(shown, [{ title: 'First' }]);

  const second = transaction.begin({ title: 'Second' });
  assert.deepEqual(shown, [{ title: 'First' }, { title: 'Second' }]);
  transaction.finish(first);
  assert.equal(hides(), 0);
  transaction.finish(second);
  assert.equal(hides(), 1);
});

test('reset cancels pending ownership and hides visible activity exactly once', () => {
  const { transaction, callbacks, shown, hides } = harness();
  const ticket = transaction.begin({ title: 'Arranging' });
  callbacks.values().next().value.callback();
  assert.equal(shown.length, 1);
  transaction.reset();
  assert.equal(hides(), 1);
  assert.equal(transaction.finish(ticket), false);
  assert.equal(hides(), 1);
});
