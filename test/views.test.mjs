import test from 'node:test';
import assert from 'node:assert/strict';

import { viewCallGraph, viewFileDeps } from '../src/views.mjs';

function graph() {
  const nodes = new Map([
    ['a', { id: 'a', label: 'a', kind: 'function', file: 'src/a.mjs' }],
    ['b', { id: 'b', label: 'b', kind: 'function', file: 'src/b.mjs' }],
    ['c', { id: 'c', label: 'c', kind: 'function', file: 'src/c.mjs' }],
  ]);
  return {
    nodes,
    fileOf: new Map([...nodes].map(([id, node]) => [id, node.file])),
    edges: [
      { s: 'a', t: 'b', k: 'calls' },
      { s: 'b', t: 'c', k: 'calls' },
    ],
  };
}

test('truncated file dependencies report loaded and total in-scope files', () => {
  const result = viewFileDeps(graph(), { limit: 2 });

  assert.equal(result.truncated, true);
  assert.deepEqual(result.scope, { loaded: 2, total: 3, limit: 2 });
});

test('truncated call graph reports ranked loaded and total symbols', () => {
  const result = viewCallGraph(graph(), { limit: 2 });

  assert.equal(result.truncated, true);
  assert.deepEqual(result.scope, { loaded: 2, total: 3, limit: 2 });
});

test('both-direction Call traversal excludes mixed-direction context walks', () => {
  const nodes = new Map(['focus', 'caller', 'callee', 'caller-context', 'callee-context']
    .map((id) => [id, { id, label: id, kind: 'function', file: `src/${id}.mjs` }]));
  const result = viewCallGraph({
    nodes,
    fileOf: new Map([...nodes].map(([id, node]) => [id, node.file])),
    edges: [
      { s: 'caller', t: 'focus', k: 'calls' },
      { s: 'caller', t: 'caller-context', k: 'calls' },
      { s: 'focus', t: 'callee', k: 'calls' },
      { s: 'callee-context', t: 'callee', k: 'calls' },
    ],
  }, { focus: 'focus', depth: 2, direction: 'both' });

  assert.deepEqual(result.nodes.map(({ id }) => id).sort(), ['callee', 'caller', 'focus']);
  assert.deepEqual(result.edges.map(({ source, target }) => `${source}->${target}`).sort(), [
    'caller->focus',
    'focus->callee',
  ]);
});
