import test from 'node:test';
import assert from 'node:assert/strict';

import { build as buildModel } from '../public/app/graphModel.js';
import { createRadialReachLayoutController } from '../public/app/layoutController.js';

function fixture() {
  return buildModel({
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
}

test('radial reach places depth on rings and direction in stable hemispheres', () => {
  const model = fixture();
  const controller = createRadialReachLayoutController(model, 'f');
  const nodes = Object.fromEntries(model.nodes.map((node) => [node.id, node]));
  const radius = (node) => Math.hypot(node.x, node.y);

  assert.deepEqual(
    Object.fromEntries(model.nodes.map((node) => [node.id, node.relationRole])),
    { f: 'focus', c: 'inbound', u: 'inbound', d: 'outbound', e: 'outbound', x: 'both' },
  );
  assert.equal(nodes.f.x, 0);
  assert.equal(nodes.f.y, 0);
  assert.ok(nodes.c.x < 0, 'direct caller belongs in the left hemisphere');
  assert.ok(nodes.u.x < 0, 'transitive caller belongs in the left hemisphere');
  assert.ok(nodes.d.x > 0, 'direct callee belongs in the right hemisphere');
  assert.ok(nodes.e.x > 0, 'transitive callee belongs in the right hemisphere');
  assert.ok(Math.abs(nodes.x.x) < 1e-9, 'bidirectional symbol belongs on the vertical axis');
  assert.ok(Math.abs(radius(nodes.c) - radius(nodes.d)) < 1e-9);
  assert.ok(radius(nodes.u) > radius(nodes.c));
  assert.ok(radius(nodes.e) > radius(nodes.d));
  assert.equal(new Set(model.nodes.map((node) => `${node.x},${node.y}`)).size, model.nodes.length);
  assert.deepEqual(
    model.links.map((link) => link.relationRole),
    ['inbound', 'inbound', 'outbound', 'outbound', 'both', 'both'],
  );

  const repeated = fixture();
  createRadialReachLayoutController(repeated, 'f');
  assert.deepEqual(
    repeated.nodes.map(({ id, x, y }) => ({ id, x, y })),
    model.nodes.map(({ id, x, y }) => ({ id, x, y })),
  );
  assert.equal(controller.id, 'radial-reach');
  assert.equal(controller.kind, 'deterministic');
  assert.equal(controller.simulation, null);
  assert.equal(controller.warmupTicks(), 0);
  assert.equal(controller.shouldContinue(), false);
});

test('radial reach expands dense rings without collapsing later depths', () => {
  const callers = Array.from({ length: 30 }, (_, index) => `caller-${String(index).padStart(2, '0')}`);
  const model = buildModel({
    nodes: ['focus', ...callers, 'outer'].map((id) => ({ id, label: id, kind: 'function' })),
    edges: [
      ...callers.map((source) => ({ source, target: 'focus', kind: 'calls' })),
      { source: 'outer', target: callers[0], kind: 'calls' },
    ],
  });

  createRadialReachLayoutController(model, 'focus');
  const direct = model.nodes
    .filter((node) => node.relationRole === 'inbound' && node.relationDepth === 1)
    .sort((left, right) => Math.atan2(left.y, left.x) - Math.atan2(right.y, right.x));
  const directRadii = direct.map((node) => Math.hypot(node.x, node.y));
  const minSpacing = direct.slice(1).reduce((minimum, node, index) => (
    Math.min(minimum, Math.hypot(node.x - direct[index].x, node.y - direct[index].y))
  ), Infinity);
  const outer = model.indexes.nodesById.get('outer');

  assert.equal(new Set(directRadii.map((radius) => radius.toFixed(6))).size, 1);
  assert.ok(directRadii[0] > 180, 'dense direct callers expand beyond the base ring');
  assert.ok(minSpacing >= direct[0].radius * 2 + 16, 'adjacent nodes retain a readable gap');
  assert.ok(Math.hypot(outer.x, outer.y) >= directRadii[0] + 180, 'later depths stay outside expanded rings');
});
