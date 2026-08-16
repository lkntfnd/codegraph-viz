import assert from 'node:assert/strict';
import test from 'node:test';

import { filterSelectedFileDirection, normalizeFileDirection } from '../public/app/fileDirection.js';

const graph = {
  nodes: ['selected', 'caller', 'callee', 'reciprocal', 'context'].map((id) => ({ id })),
  edges: [
    { source: 'caller', target: 'selected', kind: 'imports' },
    { source: 'selected', target: 'callee', kind: 'imports' },
    { source: 'reciprocal', target: 'selected', kind: 'calls' },
    { source: 'selected', target: 'reciprocal', kind: 'calls' },
    { source: 'caller', target: 'context', kind: 'imports' },
  ],
  scope: { loaded: 5 },
};

test('file direction accepts only incoming, outgoing, or both', () => {
  assert.equal(normalizeFileDirection('incoming'), 'incoming');
  assert.equal(normalizeFileDirection('outgoing'), 'outgoing');
  assert.equal(normalizeFileDirection('BOTH'), 'both');
  assert.equal(normalizeFileDirection('sideways'), 'both');
});

test('incoming keeps direct loaded dependencies that point at the selected file', () => {
  const result = filterSelectedFileDirection(graph, 'selected', 'incoming');
  assert.deepEqual(result.nodes.map((node) => node.id), ['selected', 'caller', 'reciprocal']);
  assert.deepEqual(result.edges, [graph.edges[0], graph.edges[2]]);
  assert.equal(result.scope, graph.scope);
});

test('outgoing keeps direct loaded dependencies that leave the selected file', () => {
  const result = filterSelectedFileDirection(graph, 'selected', 'outgoing');
  assert.deepEqual(result.nodes.map((node) => node.id), ['selected', 'callee', 'reciprocal']);
  assert.deepEqual(result.edges, [graph.edges[1], graph.edges[3]]);
});

test('both, missing selections, and hostile input preserve the complete scope', () => {
  assert.equal(filterSelectedFileDirection(graph, 'selected', 'both'), graph);
  assert.equal(filterSelectedFileDirection(graph, 'missing', 'incoming'), graph);
  assert.deepEqual(filterSelectedFileDirection(null, 'selected', 'incoming'), { nodes: [], edges: [] });
  assert.equal(graph.nodes.length, 5);
  assert.equal(graph.edges.length, 5);
});
