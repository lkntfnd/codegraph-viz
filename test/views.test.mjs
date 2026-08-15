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

test('focused Call traversal keeps its complete response inside the hard limit', () => {
  const nodes = new Map([['focus', {
    id: 'focus', label: 'focus', kind: 'function', file: 'src/focus.mjs',
  }]]);
  const edges = [];
  let frontier = ['focus'];
  let sequence = 0;
  for (let depth = 0; depth < 5; depth += 1) {
    const next = [];
    for (const source of frontier) {
      for (let branch = 0; branch < 5; branch += 1) {
        const target = `callee-${sequence += 1}`;
        nodes.set(target, { id: target, label: target, kind: 'function', file: `src/${target}.mjs` });
        edges.push({ s: source, t: target, k: 'calls' });
        next.push(target);
      }
    }
    frontier = next;
  }

  const result = viewCallGraph({ nodes, edges, fileOf: new Map() }, {
    focus: 'focus', depth: 5, direction: 'callees', limit: 400,
  });

  assert.equal(result.nodes.length, 400);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.scope, { loaded: 400, total: 3_906, limit: 400 });
  assert.ok(result.edges.every((edge) => result.nodes.some((node) => node.id === edge.source)
    && result.nodes.some((node) => node.id === edge.target)));
});

test('file-scoped Call traversal caps internal symbols and connected callers', () => {
  const nodes = new Map();
  const edges = [];
  for (let index = 0; index < 450; index += 1) {
    const internal = `internal-${index}`;
    const caller = `caller-${index}`;
    nodes.set(internal, { id: internal, label: internal, kind: 'function', file: 'src/large.mjs' });
    nodes.set(caller, { id: caller, label: caller, kind: 'function', file: `other/${index}.mjs` });
    edges.push({ s: caller, t: internal, k: 'calls' });
  }

  const result = viewCallGraph({ nodes, edges, fileOf: new Map() }, {
    file: 'src/large.mjs', limit: 400,
  });

  assert.equal(result.nodes.length, 400);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.scope, { loaded: 400, total: 900, limit: 400 });
});

test('File dependencies budget connected external files inside the hard limit', () => {
  const nodes = new Map([['local', {
    id: 'local', label: 'local', kind: 'function', file: 'src/local.mjs',
  }]]);
  const edges = [];
  for (let index = 0; index < 2_000; index += 1) {
    const id = `external-${index}`;
    nodes.set(id, { id, label: id, kind: 'function', file: `vendor/${id}.mjs` });
    edges.push({ s: 'local', t: id, k: 'imports' });
  }

  const result = viewFileDeps({ nodes, edges, fileOf: new Map() }, {
    prefix: 'src', limit: 600,
  });

  assert.equal(result.nodes.length, 600);
  assert.equal(result.edges.length, 599);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.scope, { loaded: 600, total: 2_001, limit: 600 });
});
