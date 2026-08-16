import test from 'node:test';
import assert from 'node:assert/strict';

import { build as buildModel } from '../public/app/graphModel.js';
import { createImpactFlowLayoutController } from '../public/app/layoutController.js';

test('impact flow places callers, callees, focus, and cycles in semantic lanes', () => {
  const model = buildModel({
    nodes: ['f', 'c', 'u', 'd', 'e', 'x'].map((id) => ({ id, label: id, kind: 'function' })),
    edges: [
      { source: 'c', target: 'f', kind: 'calls' },
      { source: 'u', target: 'c', kind: 'calls' },
      { source: 'f', target: 'd', kind: 'calls' },
      { source: 'd', target: 'e', kind: 'calls' },
      { source: 'f', target: 'x', kind: 'calls' },
      { source: 'x', target: 'f', kind: 'calls' },
    ],
  });
  const controller = createImpactFlowLayoutController(model, 'f');
  const nodes = Object.fromEntries(model.nodes.map((node) => [node.id, node]));

  assert.deepEqual(
    Object.fromEntries(model.nodes.map((node) => [node.id, node.relationRole])),
    { f: 'focus', c: 'inbound', u: 'inbound', d: 'outbound', e: 'outbound', x: 'both' },
  );
  assert.equal(nodes.f.x, 0);
  assert.equal(nodes.c.x, -240);
  assert.equal(nodes.u.x, -480);
  assert.equal(nodes.d.x, 240);
  assert.equal(nodes.e.x, 480);
  assert.equal(nodes.x.x, 0);
  assert.notEqual(nodes.x.y, 0);
  assert.deepEqual(
    model.links.map((link) => link.relationRole),
    ['inbound', 'inbound', 'outbound', 'outbound', 'both', 'both'],
  );
  assert.equal(controller.id, 'impact-flow');
  assert.equal(controller.densityMode, 'linear');
  assert.equal(controller.kind, 'deterministic');
  assert.equal(controller.simulation, null);
  assert.equal(controller.warmupTicks(), 0);
  assert.equal(controller.shouldContinue(), false);
});

test('dense impact lanes compact stable symbols into file-banded grids', () => {
  const callers = Array.from({ length: 50 }, (_, index) => ({
    id: `caller-${String(index).padStart(2, '0')}`,
    label: `caller-${String(index).padStart(2, '0')}`,
    file: `src/callers/file-${String(Math.floor(index / 5)).padStart(2, '0')}.mjs`,
    kind: 'function',
  }));
  const callees = Array.from({ length: 50 }, (_, index) => ({
    id: `callee-${String(index).padStart(2, '0')}`,
    label: `callee-${String(index).padStart(2, '0')}`,
    file: `src/callees/file-${String(Math.floor(index / 5)).padStart(2, '0')}.mjs`,
    kind: 'function',
  }));
  const bidirectional = Array.from({ length: 30 }, (_, index) => ({
    id: `both-${String(index).padStart(2, '0')}`,
    label: `both-${String(index).padStart(2, '0')}`,
    file: `src/shared/file-${String(Math.floor(index / 5)).padStart(2, '0')}.mjs`,
    kind: 'function',
  }));
  const data = {
    nodes: [
      { id: 'focus', label: 'focus', file: 'src/focus.mjs', kind: 'function' },
      ...callers,
      ...callees,
      ...bidirectional,
    ],
    edges: [
      ...callers.map((node) => ({ source: node.id, target: 'focus', kind: 'calls' })),
      ...callees.map((node) => ({ source: 'focus', target: node.id, kind: 'calls' })),
      ...bidirectional.flatMap((node) => [
        { source: node.id, target: 'focus', kind: 'calls' },
        { source: 'focus', target: node.id, kind: 'calls' },
      ]),
    ],
  };
  const model = buildModel(data);
  const controller = createImpactFlowLayoutController(model, 'focus');
  const positions = new Map(model.nodes.map((node) => [node.id, {
    x: node.x,
    y: node.y,
    file: node.callFileGroup,
  }]));

  assert.equal(controller.densityMode, 'file-bands');
  assert.ok(callers.every((node) => positions.get(node.id).x <= -240));
  assert.ok(callees.every((node) => positions.get(node.id).x >= 240));
  assert.ok(Math.max(...callers.map((node) => positions.get(node.id).y))
    - Math.min(...callers.map((node) => positions.get(node.id).y)) < 1_000);
  assert.equal(new Set(callers.map((node) => `${positions.get(node.id).x}:${positions.get(node.id).y}`)).size, 50);
  assert.ok(bidirectional.every((node) => Math.abs(positions.get(node.id).x) < 240));
  assert.ok(bidirectional.every((node) => positions.get(node.id).x !== 0 || positions.get(node.id).y !== 0));
  assert.equal(new Set(bidirectional.map((node) => `${positions.get(node.id).x}:${positions.get(node.id).y}`)).size, 30);
  for (let fileIndex = 0; fileIndex < 10; fileIndex += 1) {
    const file = `src/callers/file-${String(fileIndex).padStart(2, '0')}.mjs`;
    const members = callers.filter((node) => node.file === file);
    assert.equal(new Set(members.map((node) => positions.get(node.id).y)).size, 1);
    assert.ok(members.every((node) => positions.get(node.id).file === file));
  }

  const reversed = buildModel({ nodes: [...data.nodes].reverse(), edges: [...data.edges].reverse() });
  createImpactFlowLayoutController(reversed, 'focus');
  assert.deepEqual(
    Object.fromEntries(reversed.nodes.map((node) => [node.id, [node.x, node.y]])),
    Object.fromEntries(model.nodes.map((node) => [node.id, [node.x, node.y]])),
  );
});

test('dense bidirectional impact bands keep a bounded overview aspect ratio', () => {
  const bidirectional = Array.from({ length: 399 }, (_, index) => ({
    id: `both-${String(index).padStart(3, '0')}`,
    label: `both-${String(index).padStart(3, '0')}`,
    file: `src/shared/file-${String(Math.floor(index / 10)).padStart(2, '0')}.mjs`,
    kind: 'function',
  }));
  const model = buildModel({
    nodes: [
      { id: 'focus', label: 'focus', file: 'src/focus.mjs', kind: 'function' },
      ...bidirectional,
    ],
    edges: bidirectional.flatMap((node) => [
      { source: node.id, target: 'focus', kind: 'calls' },
      { source: 'focus', target: node.id, kind: 'calls' },
    ]),
  });

  createImpactFlowLayoutController(model, 'focus');
  const width = Math.max(...model.nodes.map((node) => node.x))
    - Math.min(...model.nodes.map((node) => node.x));
  const height = Math.max(...model.nodes.map((node) => node.y))
    - Math.min(...model.nodes.map((node) => node.y));

  assert.ok(height / width <= 1.5, `expected compact impact overview, received ${width}x${height}`);
});
