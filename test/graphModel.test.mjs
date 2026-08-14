import test from 'node:test';
import assert from 'node:assert/strict';

import { build } from '../public/app/graphModel.js';
import { GRAPH_CONSTANTS } from '../public/app/settings.js';
import { apiData } from './fixtures/graph.mjs';

const modelSettings = GRAPH_CONSTANTS;

test('build drops links whose endpoints are absent from the node set', () => {
  const data = {
    ...apiData,
    edges: [
      ...apiData.edges,
      { source: 'a', target: 'missing', weight: 9 },
      { source: 'missing', target: 'b', weight: 7 },
    ],
  };

  const model = build(data, modelSettings);

  assert.deepEqual(model.links, [
    { source: 'a', target: 'b', weight: 2 },
    { source: 'a', target: 'c', weight: 1 },
  ]);
});

test('build defaults a missing link weight to one', () => {
  const data = {
    ...apiData,
    edges: [{ source: 'a', target: 'b', kind: 'calls' }],
  };

  const model = build(data, modelSettings);

  assert.deepEqual(model.links, [{ source: 'a', target: 'b', weight: 1 }]);
});

test('build counts each sanitized incident link in node degree', () => {
  const model = build(apiData, modelSettings);

  assert.deepEqual(
    Object.fromEntries(model.nodes.map((node) => [node.id, node.degree])),
    { a: 2, b: 1, c: 1 },
  );
});

test('build derives and clamps radius from node importance', () => {
  const model = build(
    {
      ...apiData,
      nodes: [
        ...apiData.nodes,
        { id: 'hub', label: 'hub.js', kind: 'file', size: 1_000_000 },
      ],
    },
    modelSettings,
  );
  const nodes = Object.fromEntries(model.nodes.map((node) => [node.id, node]));

  assert.ok(Math.abs(nodes.a.radius - 8.059644256269408) < 1e-12);
  assert.equal(nodes.hub.radius, 26);
  assert.ok(model.nodes.every((node) => node.radius >= 3 && node.radius <= 26));
});

test('build derives mass monotonically from node importance', () => {
  const model = build(apiData, modelSettings);
  const nodes = Object.fromEntries(model.nodes.map((node) => [node.id, node]));

  assert.ok(Math.abs(nodes.a.mass - 2.8973665961010275) < 1e-12);
  assert.ok(nodes.a.mass > nodes.b.mass);
  assert.ok(nodes.b.mass > nodes.c.mass);
});

test('build falls back to degree when a node has no size', () => {
  const model = build(
    {
      nodes: [
        { id: 'hub', label: 'hub', kind: 'function' },
        { id: 'left', label: 'left', kind: 'function' },
        { id: 'right', label: 'right', kind: 'method' },
      ],
      edges: [
        { source: 'hub', target: 'left' },
        { source: 'hub', target: 'right' },
      ],
    },
    modelSettings,
  );
  const nodes = Object.fromEntries(model.nodes.map((node) => [node.id, node]));

  assert.equal(nodes.hub.degree, 2);
  assert.ok(nodes.hub.radius > nodes.left.radius);
  assert.ok(nodes.hub.mass > nodes.right.mass);
});

test('build colors every documented kind alias after exact normalization', () => {
  const nodes = [
    { id: 'folder', kind: ' folder ' },
    { id: 'module', kind: 'MODULE' },
    { id: 'file', kind: 'file' },
    { id: 'function', kind: 'Function' },
    { id: 'method', kind: 'method' },
    { id: 'class', kind: 'CLASS' },
    { id: 'interface', kind: ' interface ' },
  ];

  const model = build({ nodes, edges: [] }, modelSettings);

  assert.deepEqual(
    Object.fromEntries(model.nodes.map((node) => [node.id, node.color])),
    {
      folder: '#c98cff',
      module: '#c98cff',
      file: '#f5b14c',
      function: '#38e1c6',
      method: '#38e1c6',
      class: '#6aa6ff',
      interface: '#6aa6ff',
    },
  );
  assert.equal(model.nodes[0].kind, ' folder ');
});

test('build preserves and dims external nodes regardless of kind', () => {
  const model = build(apiData, modelSettings);
  const external = model.nodes.find((node) => node.id === 'c');

  assert.equal(external.external, true);
  assert.equal(external.kind, 'file');
  assert.equal(external.color, '#4a5560');
});

test('build treats only exact kind aliases as known', () => {
  const model = build(
    {
      nodes: [
        { id: 'function-like', kind: 'async-function' },
        { id: 'folder-like', kind: 'folder-group' },
        { id: 'missing-kind' },
      ],
      edges: [],
    },
    modelSettings,
  );

  assert.deepEqual(
    model.nodes.map((node) => node.color),
    ['#6b7682', '#6b7682', '#6b7682'],
  );
});

test('build leaves API nodes and edges immutable', () => {
  const input = structuredClone(apiData);
  const before = structuredClone(input);

  const model = build(input, modelSettings);

  assert.deepEqual(input, before);
  assert.notStrictEqual(model.nodes[0], input.nodes[0]);
  assert.notStrictEqual(model.links[0], input.edges[0]);

  model.nodes[0].label = 'changed';
  model.links[0].weight = 99;
  assert.equal(input.nodes[0].label, 'a.js');
  assert.equal(input.edges[0].weight, 2);
});

test('build uses the shared graph constants when settings omit model overrides', () => {
  const model = build(apiData);
  const node = model.nodes.find(({ id }) => id === 'a');

  assert.ok(Math.abs(node.radius - 8.059644256269408) < 1e-12);
  assert.ok(Math.abs(node.mass - 2.8973665961010275) < 1e-12);
});
