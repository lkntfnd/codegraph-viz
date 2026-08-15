import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecentSymbolStore, rememberRecentSymbol } from '../public/app/recentSymbols.js';

test('recent symbols are normalized, deduplicated, and bounded most-recent first', () => {
  let recent = [];
  for (let index = 0; index < 7; index += 1) {
    recent = rememberRecentSymbol(recent, {
      id: index,
      label: `Symbol ${index}`,
      kind: index % 2 ? 'method' : 'function',
      file: index === 0 ? null : `src/${index}.js`,
      ignored: true,
    });
  }
  assert.deepEqual(recent.map(({ id }) => id), ['6', '5', '4', '3', '2']);
  recent = rememberRecentSymbol(recent, { id: 4, label: 'Symbol four', kind: 'method' });
  assert.deepEqual(recent.map(({ id }) => id), ['4', '6', '5', '3', '2']);
  assert.deepEqual(recent[0], { id: '4', label: 'Symbol four', kind: 'method', file: null });
  assert.deepEqual(rememberRecentSymbol(recent, { label: 'missing id' }), recent);
});

test('recent symbol storage is index-aware and defensive', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const store = createRecentSymbolStore(storage, 'recent-test');
  const items = [{ id: 'a', label: 'alpha', kind: 'function', file: 'src/a.js' }];
  store.save(42, items);
  assert.deepEqual(store.load(42), items);
  assert.deepEqual(store.load(43), []);
  values.set('recent-test', '{bad json');
  assert.deepEqual(store.load(42), []);
});
