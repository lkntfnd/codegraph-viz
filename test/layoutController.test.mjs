import test from 'node:test';
import assert from 'node:assert/strict';
import * as d3 from 'd3';

import { describeMatrixPosition, matrixPositionAt } from '../public/app/dependencyMatrix.js';
import { build as buildModel } from '../public/app/graphModel.js';
import {
  createForceLayoutController,
  createDependencyMatrixLayoutController,
  createHotspotLayoutController,
  createStructureTreeLayoutController,
} from '../public/app/layoutController.js';
import { DEFAULTS } from '../public/app/settings.js';
import { apiData } from './fixtures/graph.mjs';

test('force layout controller satisfies the shared execution lifecycle', () => {
  const model = buildModel(apiData);
  const controller = createForceLayoutController(d3, model, DEFAULTS);

  assert.equal(controller.id, 'constellation');
  assert.equal(controller.kind, 'dynamic');
  assert.equal(controller.warmupTicks(false), 15);
  assert.equal(controller.warmupTicks(true), 4);
  assert.equal(controller.simulation.alphaTarget(), 0);

  controller.setMotion(true);
  assert.equal(controller.simulation.alphaTarget(), 0.015);
  controller.tick(true);
  assert.ok(model.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));

  controller.configure({ ...DEFAULTS, linkDistance: 144 });
  assert.equal(controller.simulation.force('link').distance()(), 144);
  assert.equal(typeof controller.shouldContinue(false), 'boolean');
  controller.dispose();
});

test('hotspot landscape assigns stable top-level folder anchors to file nodes', () => {
  const model = buildModel({
    nodes: [
      { id: 'src-a', label: 'a.mjs', kind: 'file', path: 'src/a.mjs' },
      { id: 'src-b', label: 'b.mjs', kind: 'file', path: 'src/deep/b.mjs' },
      { id: 'test-a', label: 'a.test.mjs', kind: 'file', path: 'test/a.test.mjs' },
      { id: 'root', label: 'config.mjs', kind: 'file', path: 'config.mjs' },
      { id: 'windows', label: 'worker.mjs', kind: 'file', path: 'scripts\\worker.mjs' },
    ],
    edges: [
      { source: 'src-a', target: 'src-b' },
      { source: 'test-a', target: 'src-a' },
    ],
  }, undefined, { view: 'filedeps' });
  const controller = createHotspotLayoutController(d3, model, DEFAULTS);
  const byId = model.indexes.nodesById;

  assert.equal(controller.id, 'hotspot-landscape');
  assert.equal(controller.kind, 'dynamic');
  assert.equal(byId.get('src-a').folderGroup, 'src');
  assert.equal(byId.get('src-b').folderGroup, 'src');
  assert.equal(byId.get('test-a').folderGroup, 'test');
  assert.equal(byId.get('windows').folderGroup, 'scripts');
  assert.equal(byId.get('root').folderGroup, '(root)');
  assert.equal(byId.get('src-a').folderAnchorX, byId.get('src-b').folderAnchorX);
  assert.equal(byId.get('src-a').folderAnchorY, byId.get('src-b').folderAnchorY);
  assert.notDeepEqual(
    [byId.get('src-a').folderAnchorX, byId.get('src-a').folderAnchorY],
    [byId.get('test-a').folderAnchorX, byId.get('test-a').folderAnchorY],
  );
  assert.equal(controller.simulation.force('x').x()(byId.get('src-a')), byId.get('src-a').folderAnchorX);
  assert.equal(controller.simulation.force('y').y()(byId.get('test-a')), byId.get('test-a').folderAnchorY);

  controller.configure({ ...DEFAULTS, centerForce: 0.08 });
  assert.equal(controller.simulation.force('x').x()(byId.get('src-b')), byId.get('src-b').folderAnchorX);
  controller.dispose();
});

test('hotspot landscape uses stable non-overlapping grid clusters above the force budget', () => {
  const data = {
    nodes: [
      { id: 'src-c', label: 'c.mjs', kind: 'file', path: 'src/c.mjs' },
      { id: 'test-b', label: 'b.test.mjs', kind: 'file', path: 'test/b.test.mjs' },
      { id: 'src-a', label: 'a.mjs', kind: 'file', path: 'src/a.mjs' },
      { id: 'test-a', label: 'a.test.mjs', kind: 'file', path: 'test/a.test.mjs' },
      { id: 'src-b', label: 'b.mjs', kind: 'file', path: 'src/b.mjs' },
    ],
    edges: [],
  };
  const model = buildModel(data, undefined, { view: 'filedeps' });
  const repeated = buildModel({ ...data, nodes: [...data.nodes].reverse() }, undefined, { view: 'filedeps' });
  const controller = createHotspotLayoutController(d3, model, DEFAULTS, { maxPhysicsNodes: 4 });
  const repeatedController = createHotspotLayoutController(d3, repeated, DEFAULTS, { maxPhysicsNodes: 4 });
  const positions = (graph) => [...graph.nodes]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, x, y, folderGroup, folderAnchorX, folderAnchorY }) => (
      { id, x, y, folderGroup, folderAnchorX, folderAnchorY }
    ));

  assert.equal(controller.id, 'hotspot-landscape');
  assert.equal(controller.kind, 'deterministic');
  assert.equal(controller.simulation, null);
  assert.equal(controller.scaleMode, 'cluster-grid');
  assert.equal(controller.warmupTicks(false), 0);
  assert.deepEqual(positions(model), positions(repeated));
  assert.ok(model.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.notDeepEqual(
    [model.indexes.nodesById.get('src-a').folderAnchorX, model.indexes.nodesById.get('src-a').folderAnchorY],
    [model.indexes.nodesById.get('test-a').folderAnchorX, model.indexes.nodesById.get('test-a').folderAnchorY],
  );

  controller.dispose();
  repeatedController.dispose();
});

test('dependency matrix controller assigns deterministic square cell geometry', () => {
  const model = buildModel({
    nodes: [
      { id: 'b', label: 'beta.mjs', kind: 'file', path: 'test/beta.mjs' },
      { id: 'root', label: 'config.mjs', kind: 'file', path: 'config.mjs' },
      { id: 'a', label: 'alpha.mjs', kind: 'file', path: 'src/alpha.mjs' },
    ],
    edges: [
      { source: 'root', target: 'a', weight: 1 },
      { source: 'a', target: 'b', weight: 2 },
    ],
  }, undefined, { view: 'filedeps' });
  const controller = createDependencyMatrixLayoutController(model, { cellSize: 20 });

  assert.equal(controller.id, 'dependency-matrix');
  assert.equal(controller.kind, 'deterministic');
  assert.equal(controller.simulation, null);
  assert.equal(controller.matrix.cellSize, 20);
  assert.equal(controller.matrix.dimension, 60);
  assert.equal(controller.matrix.originX, -30);
  assert.equal(controller.matrix.originY, -30);
  assert.equal(controller.matrix.cellByCoordinate.size, 2);
  assert.deepEqual(controller.matrix.nodes.map(({ id, matrixIndex, x, y }) => ({ id, matrixIndex, x, y })), [
    { id: 'root', matrixIndex: 0, x: -20, y: -20 },
    { id: 'a', matrixIndex: 1, x: 0, y: 0 },
    { id: 'b', matrixIndex: 2, x: 20, y: 20 },
  ]);
  assert.deepEqual(
    controller.matrix.cells.map(({ sourceId, targetId, x, y, size, weight }) => ({ sourceId, targetId, x, y, size, weight })),
    [
      { sourceId: 'root', targetId: 'a', x: 0, y: -20, size: 20, weight: 1 },
      { sourceId: 'a', targetId: 'b', x: 20, y: 0, size: 20, weight: 2 },
    ],
  );
  assert.equal(controller.warmupTicks(false), 0);
  assert.equal(controller.shouldContinue(false), false);

  const weighted = matrixPositionAt(controller.matrix, 0, -20);
  assert.equal(weighted.sourceId, 'root');
  assert.equal(weighted.targetId, 'a');
  assert.equal(weighted.cell.weight, 1);
  assert.deepEqual(describeMatrixPosition(weighted), {
    sourceId: 'root',
    sourceLabel: 'config.mjs',
    sourcePath: 'config.mjs',
    targetId: 'a',
    targetLabel: 'alpha.mjs',
    targetPath: 'src/alpha.mjs',
    weight: 1,
    kinds: [],
    relations: [],
    hasDependency: true,
  });
  const empty = matrixPositionAt(controller.matrix, -20, -20);
  assert.equal(empty.sourceId, 'root');
  assert.equal(empty.targetId, 'root');
  assert.equal(empty.cell, null);
  assert.equal(describeMatrixPosition(empty).hasDependency, false);
  assert.equal(matrixPositionAt(controller.matrix, -31, 0), null);
  assert.equal(matrixPositionAt(controller.matrix, 30, 0), null);
});

test('structure tree controller places stable containment depth columns and subtrees', () => {
  const model = buildModel({
    nodes: [
      { id: 'test/spec.mjs', label: 'spec.mjs', kind: 'file', parent: 'test' },
      { id: '.', label: 'root', kind: 'folder', parent: null },
      { id: 'src/utils.mjs', label: 'utils.mjs', kind: 'file', parent: 'src' },
      { id: 'src/app/index.mjs', label: 'index.mjs', kind: 'file', parent: 'src/app' },
      { id: 'src/app', label: 'app', kind: 'folder', parent: 'src' },
      { id: 'test', label: 'test', kind: 'folder', parent: '.' },
      { id: 'src', label: 'src', kind: 'folder', parent: '.' },
    ],
    edges: [
      { source: '.', target: 'src', kind: 'contains' },
      { source: '.', target: 'test', kind: 'contains' },
      { source: 'src', target: 'src/app', kind: 'contains' },
      { source: 'src', target: 'src/utils.mjs', kind: 'contains' },
      { source: 'src/app', target: 'src/app/index.mjs', kind: 'contains' },
      { source: 'test', target: 'test/spec.mjs', kind: 'contains' },
    ],
  });
  const controller = createStructureTreeLayoutController(model, { columnGap: 200, rowGap: 80 });
  const byId = model.indexes.nodesById;

  assert.equal(controller.id, 'structure-tree');
  assert.equal(controller.kind, 'deterministic');
  assert.deepEqual(controller.tree.roots, ['.']);
  assert.equal(controller.tree.maxDepth, 3);
  assert.deepEqual(
    ['.', 'src', 'test', 'src/app', 'src/utils.mjs', 'src/app/index.mjs', 'test/spec.mjs']
      .map((id) => ({ id, depth: byId.get(id).treeDepth, x: byId.get(id).x, y: byId.get(id).y })),
    [
      { id: '.', depth: 0, x: 0, y: 0 },
      { id: 'src', depth: 1, x: 200, y: -60 },
      { id: 'test', depth: 1, x: 200, y: 60 },
      { id: 'src/app', depth: 2, x: 400, y: -100 },
      { id: 'src/utils.mjs', depth: 2, x: 400, y: -20 },
      { id: 'src/app/index.mjs', depth: 3, x: 600, y: -100 },
      { id: 'test/spec.mjs', depth: 2, x: 400, y: 60 },
    ],
  );
  assert.deepEqual(controller.tree.childrenById.get('src'), ['src/app', 'src/utils.mjs']);
  assert.equal(controller.warmupTicks(false), 0);
  assert.equal(controller.shouldContinue(false), false);

  const collapsed = createStructureTreeLayoutController(model, {
    columnGap: 200,
    rowGap: 80,
    collapsedIds: new Set(['src']),
  });
  assert.deepEqual([...collapsed.tree.visibleNodeIds], ['.', 'src', 'test', 'test/spec.mjs']);
  assert.deepEqual([...collapsed.tree.collapsedIds], ['src']);
  assert.equal(byId.get('src').treeCollapsed, true);
  assert.equal(byId.get('src/app').treeHidden, true);
  assert.equal(byId.get('src/utils.mjs').treeHidden, true);
  assert.equal(byId.get('test/spec.mjs').treeHidden, false);
  assert.equal(collapsed.tree.maxDepth, 2);
});
