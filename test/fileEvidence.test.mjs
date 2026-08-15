import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterFileDependencyEvidence,
  normalizeFileEvidence,
  normalizeMinimumCouplingPercentile,
} from '../public/app/fileEvidence.js';

const graph = {
  view: 'filedeps',
  nodes: [
    { id: 'a', label: 'a.js' },
    { id: 'b', label: 'b.js' },
    { id: 'c', label: 'c.js' },
    { id: 'd', label: 'd.js' },
  ],
  edges: [
    { source: 'a', target: 'b', weight: 2 },
    { source: { id: 'b' }, target: { id: 'c' }, weight: 1 },
  ],
};

test('file evidence accepts only the supported semantic views', () => {
  assert.equal(normalizeFileEvidence('all'), 'all');
  assert.equal(normalizeFileEvidence('isolated'), 'isolated');
  assert.equal(normalizeFileEvidence(' cycles '), 'cycles');
  assert.equal(normalizeFileEvidence('hotspots'), 'all');
  assert.equal(normalizeFileEvidence(null), 'all');
});

test('coupling percentile is bounded to an integer semantic threshold', () => {
  assert.equal(normalizeMinimumCouplingPercentile(75.9), 75);
  assert.equal(normalizeMinimumCouplingPercentile(-1), 0);
  assert.equal(normalizeMinimumCouplingPercentile(200), 100);
  assert.equal(normalizeMinimumCouplingPercentile('bad'), 0);
});

test('coupling landscape keeps nodes at or above the loaded-scope percentile', () => {
  const weighted = {
    ...graph,
    edges: [
      { source: 'a', target: 'b', weight: 3 },
      { source: 'b', target: 'c', weight: 1 },
    ],
  };
  const result = filterFileDependencyEvidence(weighted, 'all', { minimumCouplingPercentile: 75 });
  assert.deepEqual(result.nodes.map((node) => node.id), ['a', 'b']);
  assert.deepEqual(result.edges.map((edge) => `${edge.source}->${edge.target}`), ['a->b']);
});

test('cycle evidence keeps cyclic files and their induced visible relationships', () => {
  const cyclicGraph = {
    view: 'filedeps',
    nodes: [...graph.nodes, { id: 'e', label: 'e.js' }],
    edges: [
      { source: 'a', target: 'b', weight: 1 },
      { source: 'b', target: 'a', weight: 1 },
      { source: 'b', target: 'c', weight: 1 },
      { source: 'd', target: 'd', weight: 1 },
    ],
  };
  const cycles = filterFileDependencyEvidence(cyclicGraph, 'cycles');
  assert.deepEqual(cycles.nodes.map((node) => node.id), ['a', 'b', 'd']);
  assert.deepEqual(cycles.edges.map((edge) => `${edge.source}->${edge.target}`), ['a->b', 'b->a', 'd->d']);
});

test('isolated evidence keeps only nodes with no visible incident edge', () => {
  assert.deepEqual(filterFileDependencyEvidence(graph, 'isolated'), {
    ...graph,
    nodes: [{ id: 'd', label: 'd.js' }],
    edges: [],
  });
});

test('file evidence is defensive and isolation follows the supplied filtered edges', () => {
  const thresholded = { ...graph, edges: [graph.edges[0]] };
  const isolated = filterFileDependencyEvidence(thresholded, 'isolated');
  assert.deepEqual(isolated.nodes.map((node) => node.id), ['c', 'd']);
  isolated.nodes[0].label = 'mutated';
  assert.equal(graph.nodes[2].label, 'c.js');
  assert.notEqual(filterFileDependencyEvidence(graph, 'all'), graph);
});
