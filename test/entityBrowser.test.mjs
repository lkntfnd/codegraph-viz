import assert from 'node:assert/strict';
import test from 'node:test';

import { browseGraphEntities } from '../public/app/entityBrowser.js';

const model = {
  nodes: [
    { id: 'src/auth.mjs', label: 'auth.mjs', kind: 'file', path: 'src/auth.mjs', degree: 4, coupling: 8 },
    { id: 'src/api.mjs', label: 'api.mjs', kind: 'file', path: 'src/api.mjs', degree: 2, coupling: 3 },
    { id: 'test/auth.test.mjs', label: 'auth.test.mjs', kind: 'file', path: 'test/auth.test.mjs', degree: 1, coupling: 1 },
  ],
  indexes: {
    inboundById: new Map([
      ['src/auth.mjs', [{ source: 'src/api.mjs' }]],
      ['src/api.mjs', []],
      ['test/auth.test.mjs', [{ source: 'src/auth.mjs' }]],
    ]),
    outboundById: new Map([
      ['src/auth.mjs', [{ target: 'test/auth.test.mjs' }]],
      ['src/api.mjs', [{ target: 'src/auth.mjs' }]],
      ['test/auth.test.mjs', []],
    ]),
  },
};

test('entity browser ranks the loaded overview by explicit graph evidence', () => {
  assert.deepEqual(browseGraphEntities(model, '', { limit: 2 }), {
    items: [
      { id: 'src/auth.mjs', label: 'auth.mjs', kind: 'file', path: 'src/auth.mjs', inbound: 1, outbound: 1 },
      { id: 'src/api.mjs', label: 'api.mjs', kind: 'file', path: 'src/api.mjs', inbound: 0, outbound: 1 },
    ],
    total: 3,
    limited: true,
  });
});

test('entity browser searches labels, paths, ids, and kinds case-insensitively', () => {
  assert.deepEqual(
    browseGraphEntities(model, 'TEST').items.map((item) => item.id),
    ['test/auth.test.mjs'],
  );
  assert.deepEqual(
    browseGraphEntities(model, 'src/auth').items.map((item) => item.id),
    ['src/auth.mjs'],
  );
  assert.equal(browseGraphEntities(model, 'folder').total, 0);
});

test('entity browser clamps its DOM budget and returns defensive records', () => {
  const result = browseGraphEntities(model, '', { limit: 1_000 });
  assert.equal(result.items.length, 3);
  result.items[0].label = 'mutated';
  assert.equal(model.nodes[0].label, 'auth.mjs');
  assert.equal(browseGraphEntities({ nodes: Array.from({ length: 500 }, (_, id) => ({ id })) }, '').items.length, 100);
});
