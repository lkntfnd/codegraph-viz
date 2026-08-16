import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDependencyMatrix,
  describeMatrixPosition,
  formatRelationBreakdown,
  matrixEntityFocus,
} from '../public/app/dependencyMatrix.js';
import { build as buildGraph } from '../public/app/graphModel.js';

test('dependency matrix orders by folder and SCC while preserving directed weights', () => {
  const model = buildGraph({
    nodes: [
      { id: 'd', label: 'delta.mjs', kind: 'file', path: 'src/delta.mjs' },
      { id: 'b', label: 'beta.mjs', kind: 'file', path: 'src/beta.mjs' },
      { id: 'c', label: 'case.test.mjs', kind: 'file', path: 'test/case.test.mjs' },
      { id: 'a', label: 'alpha.mjs', kind: 'file', path: 'src/alpha.mjs' },
      { id: 'root', label: 'config.mjs', kind: 'file', path: 'config.mjs' },
    ],
    edges: [
      {
        source: 'a',
        target: 'b',
        weight: 2,
        relations: [{ kind: 'imports', weight: 2 }],
      },
      { source: 'b', target: 'a', weight: 1, kind: 'imports' },
      { source: 'c', target: 'a', weight: 4, kind: 'calls' },
      { source: 'd', target: 'c', weight: 3, kind: 'imports' },
      { source: 'root', target: 'a', weight: 1, kind: 'imports' },
    ],
  }, undefined, { view: 'filedeps' });

  const matrix = buildDependencyMatrix(model);

  assert.deepEqual(matrix.nodes.map(({ id }) => id), ['root', 'a', 'b', 'd', 'c']);
  assert.deepEqual(matrix.folderGroups, [
    { id: '(root)', start: 0, end: 1, count: 1 },
    { id: 'src', start: 1, end: 4, count: 3 },
    { id: 'test', start: 4, end: 5, count: 1 },
  ]);
  assert.deepEqual(matrix.cycleGroups, [
    { id: 'a', indexes: [1, 2], members: ['a', 'b'] },
  ]);
  assert.deepEqual(matrix.cells, [
    {
      sourceId: 'root', targetId: 'a', sourceIndex: 0, targetIndex: 1, weight: 1,
      kinds: ['imports'], relations: [{ kind: 'imports', weight: 1 }],
    },
    {
      sourceId: 'a', targetId: 'b', sourceIndex: 1, targetIndex: 2, weight: 2,
      kinds: ['imports'], relations: [{ kind: 'imports', weight: 2 }],
    },
    {
      sourceId: 'b', targetId: 'a', sourceIndex: 2, targetIndex: 1, weight: 1,
      kinds: ['imports'], relations: [{ kind: 'imports', weight: 1 }],
    },
    {
      sourceId: 'd', targetId: 'c', sourceIndex: 3, targetIndex: 4, weight: 3,
      kinds: ['imports'], relations: [{ kind: 'imports', weight: 3 }],
    },
    {
      sourceId: 'c', targetId: 'a', sourceIndex: 4, targetIndex: 1, weight: 4,
      kinds: ['calls'], relations: [{ kind: 'calls', weight: 4 }],
    },
  ]);
  assert.equal(matrix.maxWeight, 4);
  assert.equal(matrix.indexById.get('b'), 2);
});

test('dependency matrix normalizes Windows paths and coalesces duplicate directed cells', () => {
  const model = buildGraph({
    nodes: [
      { id: 'a', label: 'a.mjs', kind: 'file', path: 'scripts\\a.mjs' },
      { id: 'b', label: 'b.mjs', kind: 'file', path: 'scripts\\b.mjs' },
    ],
    edges: [
      { source: 'a', target: 'b', weight: 2, kind: 'imports' },
      { source: 'a', target: 'b', weight: 3, kind: 'calls' },
    ],
  }, undefined, { view: 'filedeps' });

  const matrix = buildDependencyMatrix(model);

  assert.deepEqual(matrix.folderGroups, [{ id: 'scripts', start: 0, end: 2, count: 2 }]);
  assert.deepEqual(matrix.cells, [
    {
      sourceId: 'a', targetId: 'b', sourceIndex: 0, targetIndex: 1, weight: 5,
      kinds: ['calls', 'imports'],
      relations: [
        { kind: 'calls', weight: 3 },
        { kind: 'imports', weight: 2 },
      ],
    },
  ]);
});

test('dependency matrix describes and formats count-bearing relation evidence', () => {
  const model = buildGraph({
    nodes: [
      { id: 'a', label: 'a.mjs', kind: 'file' },
      { id: 'b', label: 'b.mjs', kind: 'file' },
    ],
    edges: [{
      source: 'a',
      target: 'b',
      weight: 4,
      relations: [
        { kind: 'imports', weight: 1 },
        { kind: 'calls', weight: 3 },
      ],
    }],
  }, undefined, { view: 'filedeps' });
  const matrix = buildDependencyMatrix(model);
  const description = describeMatrixPosition({
    source: matrix.nodes[0],
    target: matrix.nodes[1],
    cell: matrix.cells[0],
  });

  assert.deepEqual(description.relations, [
    { kind: 'calls', weight: 3 },
    { kind: 'imports', weight: 1 },
  ]);
  assert.equal(formatRelationBreakdown(description.relations), 'calls × 3 · imports × 1');
  assert.equal(formatRelationBreakdown([]), 'Aggregated relation');
});

test('dependency matrix derives each cycle sort label with bounded indexed reads', () => {
  const count = 120;
  const model = buildGraph({
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `node-${index}`,
      label: `file-${String(count - index).padStart(3, '0')}.mjs`,
      kind: 'file',
      path: `src/file-${index}.mjs`,
    })),
    edges: Array.from({ length: count }, (_, index) => ({
      source: `node-${index}`,
      target: `node-${(index + 1) % count}`,
      weight: 1,
      kind: 'imports',
    })),
  }, undefined, { view: 'filedeps' });
  const nodesById = model.indexes.nodesById;
  let indexedReads = 0;
  model.indexes.nodesById = {
    has: (id) => nodesById.has(id),
    get(id) {
      indexedReads += 1;
      return nodesById.get(id);
    },
  };

  const matrix = buildDependencyMatrix(model);

  assert.equal(matrix.nodes.length, count);
  assert.ok(indexedReads <= count * 2, `expected bounded reads, received ${indexedReads}`);
});

test('matrix entity focus preserves user zoom or raises cells to an inspectable size', () => {
  const model = buildGraph({
    nodes: [
      { id: 'a', label: 'a.mjs', kind: 'file' },
      { id: 'b', label: 'b.mjs', kind: 'file' },
    ],
    edges: [{ source: 'a', target: 'b', weight: 1, kind: 'imports' }],
  }, undefined, { view: 'filedeps' });
  const matrix = { ...buildDependencyMatrix(model), cellSize: 7 };

  assert.deepEqual(matrixEntityFocus(matrix, 'b', { currentScale: 0.1 }), {
    node: matrix.nodes[1],
    position: { sourceIndex: 1, targetIndex: 1 },
    scale: 6 / 7,
  });
  assert.equal(matrixEntityFocus(matrix, 'b', { currentScale: 1.4 }).scale, 1.4);
  assert.equal(matrixEntityFocus(matrix, 'missing', { currentScale: 0.1 }), null);
});
