import test from 'node:test';
import assert from 'node:assert/strict';
import * as d3 from 'd3';

import { build as buildModel } from '../public/app/graphModel.js';
import { createTerritoryLayoutController } from '../public/app/layoutController.js';

function fixture() {
  return buildModel({
    nodes: [
      { id: 'src', label: 'src', kind: 'folder', size: 100, path: 'src', expandable: true },
      { id: 'test', label: 'test', kind: 'folder', size: 25, path: 'test', expandable: true },
      { id: 'README.md', label: 'README.md', kind: 'file', size: 5, path: 'README.md' },
    ],
    edges: [],
  });
}

function area(node) {
  const box = node.territory;
  return (box.x1 - box.x0) * (box.y1 - box.y0);
}

function overlaps(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

test('territory creates stable weighted non-overlapping cells', () => {
  const model = fixture();
  const controller = createTerritoryLayoutController(d3, model);
  const nodes = Object.fromEntries(model.nodes.map((node) => [node.id, node]));

  for (const node of model.nodes) {
    assert.ok(Object.values(node.territory).every(Number.isFinite));
    assert.ok(node.territory.x1 > node.territory.x0);
    assert.ok(node.territory.y1 > node.territory.y0);
    assert.equal(node.x, (node.territory.x0 + node.territory.x1) / 2);
    assert.equal(node.y, (node.territory.y0 + node.territory.y1) / 2);
  }
  for (let left = 0; left < model.nodes.length; left += 1) {
    for (let right = left + 1; right < model.nodes.length; right += 1) {
      assert.equal(overlaps(model.nodes[left].territory, model.nodes[right].territory), false);
    }
  }
  assert.ok(area(nodes.src) > area(nodes.test));
  assert.ok(area(nodes.test) > area(nodes['README.md']));

  const repeated = fixture();
  createTerritoryLayoutController(d3, repeated);
  assert.deepEqual(
    repeated.nodes.map(({ id, territory }) => ({ id, territory })),
    model.nodes.map(({ id, territory }) => ({ id, territory })),
  );
  assert.equal(controller.id, 'territory');
  assert.equal(controller.kind, 'deterministic');
  assert.equal(controller.simulation, null);
  assert.equal(controller.warmupTicks(), 0);
  assert.equal(controller.shouldContinue(), false);
});
