import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  filterEdgesByMinimumWeight,
  filterEdgesByRelations,
  relationKindSummary,
} from '../public/app/relationFilter.js';

test('relation summary preserves raw aggregate kinds with exact loaded weights', () => {
  assert.deepEqual(relationKindSummary([
    {
      source: 'a', target: 'b', weight: 3,
      relations: [{ kind: ' Calls ', weight: 2 }, { kind: 'imports', weight: 1 }],
    },
    { source: 'b', target: 'c', weight: 4, kind: 'references' },
    { source: 'c', target: 'd', weight: 9 },
  ]), [
    { id: 'calls', label: 'Calls', weight: 2 },
    { id: 'imports', label: 'imports', weight: 1 },
    { id: 'references', label: 'references', weight: 4 },
  ]);
});

test('minimum weight filters after visible relation weights are recomputed', () => {
  const edges = filterEdgesByRelations([{
    source: 'a', target: 'b', weight: 4,
    relations: [{ kind: 'calls', weight: 3 }, { kind: 'imports', weight: 1 }],
  }, {
    source: 'b', target: 'c', weight: 2,
    relations: [{ kind: 'imports', weight: 2 }],
  }], ['calls']);

  assert.deepEqual(filterEdgesByMinimumWeight(edges, 2), [edges[1]]);
  assert.deepEqual(filterEdgesByMinimumWeight(edges, -9), edges);
  assert.deepEqual(filterEdgesByMinimumWeight(edges, 99), []);
});

test('relation filtering recomputes aggregate weights without mutating source edges', () => {
  const edges = [
    {
      source: 'a', target: 'b', weight: 3,
      relations: [{ kind: 'calls', weight: 2 }, { kind: 'imports', weight: 1 }],
    },
    { source: 'b', target: 'c', weight: 4, kind: 'references' },
    { source: 'c', target: 'd', weight: 1 },
  ];
  const filtered = filterEdgesByRelations(edges, [' IMPORTS ', 'references']);
  filtered[0].relations[0].kind = 'mutated';

  assert.deepEqual(filtered, [
    {
      source: 'a', target: 'b', weight: 2,
      relations: [{ kind: 'mutated', weight: 2 }],
    },
    { source: 'c', target: 'd', weight: 1 },
  ]);
  assert.equal(edges[0].relations[0].kind, 'calls');
  assert.deepEqual(filterEdgesByRelations(edges, ['calls', 'imports']), [
    { source: 'b', target: 'c', weight: 4, kind: 'references' },
    { source: 'c', target: 'd', weight: 1 },
  ]);
});
