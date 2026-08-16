import test from 'node:test';
import assert from 'node:assert/strict';

import { build, couplingLegend } from '../public/app/graphModel.js';
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
    edges: [{ source: 'a', target: 'b' }],
  };

  const model = build(data, modelSettings);

  assert.deepEqual(model.links, [{ source: 'a', target: 'b', weight: 1 }]);
});

test('build preserves the API relationship kind on model links', () => {
  const data = {
    ...apiData,
    edges: [{ source: 'a', target: 'b', weight: 3, kind: 'Calls:Direct' }],
  };

  const model = build(data, modelSettings);

  assert.deepEqual(model.links, [
    { source: 'a', target: 'b', weight: 3, kind: 'Calls:Direct' },
  ]);
});

test('build defensively preserves an aggregated relationship breakdown', () => {
  const data = {
    ...apiData,
    edges: [{
      source: 'a',
      target: 'b',
      weight: 4,
      relations: [
        { kind: ' imports ', weight: 1 },
        { kind: 'calls', weight: 3 },
        { kind: '', weight: 9 },
      ],
    }],
  };

  const model = build(data, modelSettings);
  data.edges[0].relations[0].kind = 'mutated';

  assert.deepEqual(model.links, [{
    source: 'a',
    target: 'b',
    weight: 4,
    relations: [
      { kind: 'imports', weight: 1 },
      { kind: 'calls', weight: 3 },
    ],
  }]);
});

test('build indexes nodes and directed relationships for graph consumers', () => {
  const model = build(apiData, modelSettings);

  assert.equal(model.indexes.nodesById.get('a'), model.nodes[0]);
  assert.deepEqual([...model.indexes.neighborsById.get('a')], ['b', 'c']);
  assert.deepEqual(model.indexes.inboundById.get('b'), [model.links[0]]);
  assert.deepEqual(model.indexes.outboundById.get('a'), model.links);
  assert.deepEqual(model.indexes.inboundById.get('a'), []);
  assert.deepEqual(model.indexes.outboundById.get('c'), []);
});

test('build annotates and indexes conservative code-set evidence', () => {
  const input = {
    nodes: [
      { id: 'source', kind: 'file', path: 'src/main.ts' },
      { id: 'test', kind: 'file', path: 'test/main.test.ts' },
      { id: 'generated', kind: 'file', file: 'src/generated/client.ts' },
      { id: 'vendor', kind: 'file', path: 'vendor/client.test.ts' },
      { id: 'unknown', kind: 'file', path: 'scripts/release.mjs', codeSet: 'production' },
    ],
    edges: [],
  };

  const model = build(input);

  assert.deepEqual(model.nodes.map(({ id, codeSet }) => [id, codeSet]), [
    ['source', 'production'],
    ['test', 'tests'],
    ['generated', 'generated'],
    ['vendor', 'vendor'],
    ['unknown', 'unknown'],
  ]);
  assert.deepEqual(
    model.indexes.nodesByCodeSet.get('production'),
    [model.indexes.nodesById.get('source')],
  );
  assert.deepEqual(
    model.indexes.nodesByCodeSet.get('unknown'),
    [model.indexes.nodesById.get('unknown')],
  );
  assert.deepEqual(model.indexes.nodesByCodeSet.get('missing'), undefined);
  assert.equal(input.nodes[4].codeSet, 'production');
});

test('build derives explicit weighted coupling evidence and scope percentile', () => {
  const model = build(apiData);
  const byId = model.indexes.nodesById;

  assert.deepEqual(
    ['a', 'b', 'c'].map((id) => ({
      id,
      weightedInbound: byId.get(id).weightedInbound,
      weightedOutbound: byId.get(id).weightedOutbound,
      coupling: byId.get(id).coupling,
      couplingPercentile: byId.get(id).couplingPercentile,
    })),
    [
      { id: 'a', weightedInbound: 0, weightedOutbound: 3, coupling: 3, couplingPercentile: 100 },
      { id: 'b', weightedInbound: 2, weightedOutbound: 0, coupling: 2, couplingPercentile: 67 },
      { id: 'c', weightedInbound: 1, weightedOutbound: 0, coupling: 1, couplingPercentile: 33 },
    ],
  );
});

test('coupling legend reports nearest-rank loaded-scope values and radii', () => {
  assert.deepEqual(couplingLegend([
    { coupling: 8, radius: 12 },
    { coupling: 0, radius: 3 },
    { coupling: 2, radius: 7 },
    { coupling: 1, radius: 5 },
  ]), [
    { percentile: 25, value: 0, radius: 3 },
    { percentile: 50, value: 1, radius: 5 },
    { percentile: 90, value: 8, radius: 12 },
  ]);
  assert.deepEqual(couplingLegend([]), []);
});

test('File dependencies derives radius and mass from coupling instead of structural size', () => {
  const data = {
    nodes: [
      { id: 'hub', label: 'hub.mjs', kind: 'file', size: 1 },
      { id: 'large', label: 'large.mjs', kind: 'file', size: 100_000 },
      { id: 'left', label: 'left.mjs', kind: 'file', size: 1 },
      { id: 'right', label: 'right.mjs', kind: 'file', size: 1 },
      { id: 'small', label: 'small.mjs', kind: 'file', size: 1 },
    ],
    edges: [
      { source: 'left', target: 'hub', weight: 5 },
      { source: 'hub', target: 'right', weight: 5 },
      { source: 'large', target: 'right', weight: 1 },
      { source: 'small', target: 'right', weight: 1 },
    ],
  };
  const fileModel = build(data, modelSettings, { view: 'filedeps' });
  const architectureModel = build(data, modelSettings, { view: 'architecture' });
  const fileNodes = fileModel.indexes.nodesById;
  const architectureNodes = architectureModel.indexes.nodesById;

  assert.ok(fileNodes.get('hub').radius > fileNodes.get('large').radius);
  assert.ok(fileNodes.get('hub').mass > fileNodes.get('large').mass);
  assert.equal(fileNodes.get('large').radius, fileNodes.get('small').radius);
  assert.ok(architectureNodes.get('large').radius > architectureNodes.get('hub').radius);
});

test('build detects stable strongly connected components and real directed cycles', () => {
  const model = build({
    nodes: ['c', 'a', 'b', 'd', 'self', 'solo'].map((id) => ({ id, label: `${id}.mjs`, kind: 'file' })),
    edges: [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'a' },
      { source: 'c', target: 'd' },
      { source: 'self', target: 'self' },
    ],
  });
  const byId = model.indexes.nodesById;

  assert.deepEqual(
    ['a', 'b', 'c'].map((id) => ({
      id,
      componentId: byId.get(id).componentId,
      componentSize: byId.get(id).componentSize,
      inCycle: byId.get(id).inCycle,
    })),
    [
      { id: 'a', componentId: 'a', componentSize: 3, inCycle: true },
      { id: 'b', componentId: 'a', componentSize: 3, inCycle: true },
      { id: 'c', componentId: 'a', componentSize: 3, inCycle: true },
    ],
  );
  assert.deepEqual(
    ['d', 'solo'].map((id) => ({
      id,
      componentSize: byId.get(id).componentSize,
      inCycle: byId.get(id).inCycle,
    })),
    [
      { id: 'd', componentSize: 1, inCycle: false },
      { id: 'solo', componentSize: 1, inCycle: false },
    ],
  );
  assert.equal(byId.get('self').componentId, 'self');
  assert.equal(byId.get('self').componentSize, 1);
  assert.equal(byId.get('self').inCycle, true);
  assert.deepEqual(model.indexes.componentsById.get('a'), {
    id: 'a',
    members: ['a', 'b', 'c'],
    cyclic: true,
  });
  assert.equal(model.indexes.componentByNodeId.get('b'), model.indexes.componentsById.get('a'));
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
