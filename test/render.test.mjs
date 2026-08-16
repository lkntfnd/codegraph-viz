import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cycleMarkerVisible,
  cycleMarkerItems,
  createFolderHullCache,
  folderClusterHulls,
  hotspotOverviewLinks,
  hotspotOverviewNodes,
  impactOverviewActive,
  impactOverviewLinks,
  labelBudget,
  labelFontSize,
  labelOpacity,
  matrixCellOpacity,
  matrixHeaderStep,
  nodeOutlinePattern,
  radialGuideLabels,
  radialGuideRadii,
  structureTreeElbow,
  structureTreeDisclosureMark,
  structureTreeLabelLimit,
  structureTreeNodeShape,
} from '../public/app/render.js';

test('structure tree primitives use orthogonal branches and distinct folder shapes', () => {
  assert.deepEqual(structureTreeElbow({ x: 0, y: 20 }, { x: 200, y: 80 }), [
    { x: 0, y: 20 },
    { x: 100, y: 20 },
    { x: 100, y: 80 },
    { x: 200, y: 80 },
  ]);
  assert.equal(structureTreeNodeShape({ kind: 'folder' }), 'folder');
  assert.equal(structureTreeNodeShape({ kind: 'file' }), 'file');
  assert.equal(structureTreeNodeShape({ kind: 'module' }), 'file');
  assert.equal(structureTreeDisclosureMark({ kind: 'folder', treeHasChildren: true }), 'collapse');
  assert.equal(structureTreeDisclosureMark({ kind: 'folder', treeHasChildren: true, treeCollapsed: true }), 'expand');
  assert.equal(structureTreeDisclosureMark({ kind: 'file' }), null);
  assert.equal(structureTreeLabelLimit(34, 12), 4);
  assert.equal(structureTreeLabelLimit(140, 12), 19);
});

test('matrix rendering policies bound weighted intensity and header density', () => {
  assert.equal(matrixCellOpacity(0, 4), 0);
  assert.ok(matrixCellOpacity(1, 4) < matrixCellOpacity(3, 4));
  assert.equal(matrixCellOpacity(4, 4), 0.9);
  assert.equal(matrixCellOpacity(100, 4), 0.9);
  assert.equal(matrixHeaderStep(10, 40), 1);
  assert.equal(matrixHeaderStep(100, 40), 3);
  assert.equal(matrixHeaderStep(0, 40), 1);
  assert.equal(matrixHeaderStep(24, 38, 8, 12), 2);
  assert.equal(matrixHeaderStep(100, 40, 3, 12), 4);
});

test('external nodes use a zoom-stable dashed outline independent of color', () => {
  assert.deepEqual(nodeOutlinePattern({ external: true }, 2), [1.5, 1]);
  assert.deepEqual(nodeOutlinePattern({ external: false }, 2), []);
  assert.deepEqual(nodeOutlinePattern(null, 1), []);
});

test('folder hull geometry is deterministic for single, paired, and multi-node groups', () => {
  const hulls = folderClusterHulls([
    { id: 'src-c', folderGroup: 'src', x: 30, y: 40, radius: 5 },
    { id: 'src-a', folderGroup: 'src', x: 0, y: 0, radius: 6 },
    { id: 'src-b', folderGroup: 'src', x: 50, y: 0, radius: 4 },
    { id: 'test-a', folderGroup: 'test', x: 100, y: 100, radius: 5 },
    { id: 'test-b', folderGroup: 'test', x: 130, y: 100, radius: 5 },
    { id: 'root', folderGroup: '(root)', x: -100, y: -50, radius: 8 },
    { id: 'ignored', x: 999, y: 999, radius: 50 },
  ], 20);

  assert.deepEqual(hulls.map(({ id }) => id), ['(root)', 'src', 'test']);
  assert.equal(hulls[0].points.length, 12);
  assert.ok(hulls[1].points.length >= 3);
  assert.ok(hulls[2].points.length >= 4);
  assert.ok(hulls.every((hull) => hull.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))));
  assert.ok(hulls.every((hull) => Number.isFinite(hull.labelX) && Number.isFinite(hull.labelY)));
});

test('folder hull cache reuses only explicitly stable layout geometry', () => {
  const cache = createFolderHullCache();
  const nodes = [
    { id: 'a', folderGroup: 'src', x: 0, y: 0, radius: 4 },
    { id: 'b', folderGroup: 'src', x: 20, y: 0, radius: 4 },
  ];

  assert.strictEqual(cache.get(nodes, { stable: true }), cache.get(nodes, { stable: true }));
  assert.notStrictEqual(cache.get(nodes), cache.get(nodes));
});

test('cycle markers are scoped to cyclic nodes in File dependencies', () => {
  assert.equal(cycleMarkerVisible('filedeps', { inCycle: true }), true);
  assert.equal(cycleMarkerVisible('filedeps', { inCycle: false }), false);
  assert.equal(cycleMarkerVisible('architecture', { inCycle: true }), false);
  assert.equal(cycleMarkerVisible('callgraph', { inCycle: true }), false);
});

test('large fitted cycles defer rings until local evidence is highlighted', () => {
  const items = [
    { node: { id: 'a', inCycle: true }, highlighted: false },
    { node: { id: 'b', inCycle: true }, highlighted: true },
    { node: { id: 'c', inCycle: false }, highlighted: true },
  ];

  assert.deepEqual(cycleMarkerItems(items, {
    view: 'filedeps', zoom: 0.5, totalCycleCount: 1_000, limit: 160,
  }), [items[1]]);
  assert.deepEqual(cycleMarkerItems(items.map((item) => ({ ...item, highlighted: false })), {
    view: 'filedeps', zoom: 0.5, totalCycleCount: 1_000, limit: 160,
  }), []);
  assert.deepEqual(cycleMarkerItems(items, {
    view: 'filedeps', zoom: 1, totalCycleCount: 1_000, limit: 160,
  }), items.slice(0, 2));
  assert.deepEqual(cycleMarkerItems(items, {
    view: 'callgraph', zoom: 1, totalCycleCount: 1_000, limit: 160,
  }), []);
});

test('zero text fade keeps accepted labels fully opaque at every zoom', () => {
  assert.equal(labelOpacity(0.05, 0), 1);
  assert.equal(labelOpacity(1, 0), 1);
});

test('positive text fade reveals labels progressively after its threshold', () => {
  assert.equal(labelOpacity(0.4, 0.5), 0);
  assert.equal(labelOpacity(0.5, 0.5), 0);
  assert.ok(labelOpacity(0.8, 0.5) > 0);
  assert.equal(labelOpacity(2, 0.5), 1);
});

test('label size is bounded and selected labels receive readable emphasis', () => {
  assert.equal(labelFontSize({ labelSize: 13 }), 13);
  assert.equal(labelFontSize({ labelSize: 13 }, true), 15);
  assert.equal(labelFontSize({ labelSize: 2 }), 10);
  assert.equal(labelFontSize({ labelSize: 80 }), 24);
});

test('radial guides derive one stable radius per positive relation depth', () => {
  assert.deepEqual(radialGuideRadii([
    { x: 0, y: 0, relationDepth: 0 },
    { x: 180, y: 0, relationDepth: 1 },
    { x: 0, y: -180, relationDepth: 1 },
    { x: -360, y: 0, relationDepth: 2 },
    { x: Number.NaN, y: 0, relationDepth: 3 },
  ]), [180, 360]);
});

test('radial guide labels explain each valid hop ring in depth order', () => {
  assert.deepEqual(radialGuideLabels([
    { x: 0, y: 0, relationDepth: 0 },
    { x: 180, y: 0, relationDepth: 1 },
    { x: 0, y: -180, relationDepth: 1 },
    { x: -360, y: 0, relationDepth: 2 },
    { x: Number.NaN, y: 0, relationDepth: 3 },
  ]), [
    { depth: 1, radius: 180, label: '1 hop' },
    { depth: 2, radius: 360, label: '2 hops' },
  ]);
});

test('label density presets provide ordered bounded admission budgets', () => {
  const size = { width: 1440, height: 900 };
  const minimal = labelBudget(size, 1, 'minimal');
  const balanced = labelBudget(size, 1, 'balanced');
  const dense = labelBudget(size, 1, 'dense');

  assert.ok(minimal >= 8 && minimal <= 80);
  assert.ok(minimal < balanced);
  assert.ok(balanced < dense);
  assert.equal(labelBudget(size, 1, 'unknown'), balanced);
  assert.ok(labelBudget({ width: 1, height: 1 }, 0.1, 'minimal') >= 8);
  assert.ok(labelBudget({ width: 10000, height: 10000 }, 5, 'dense') <= 400);
});

test('overview zoom caps labels to a semantic landmark tier', () => {
  const mobile = { width: 375, height: 812 };
  assert.equal(labelBudget(mobile, 0.5, 'minimal'), 8);
  assert.equal(labelBudget(mobile, 0.5, 'balanced'), 8);
  assert.equal(labelBudget(mobile, 0.5, 'dense'), 12);
});

test('large Hotspot overviews keep strongest background links and complete highlighted evidence', () => {
  const links = [
    { source: 'b', target: 'c', weight: 2, highlighted: false },
    { source: 'a', target: 'd', weight: 5, highlighted: false },
    { source: 'a', target: 'b', weight: 2, highlighted: false },
    { source: 'c', target: 'd', weight: 1, highlighted: false },
  ];

  assert.deepEqual(
    hotspotOverviewLinks(links, { zoom: 0.5, totalLinkCount: 3_000, limit: 2 }),
    [links[1], links[2]],
  );
  const highlighted = links.map((link, index) => ({ ...link, highlighted: index !== 3 }));
  assert.deepEqual(
    hotspotOverviewLinks(highlighted, { zoom: 0.5, totalLinkCount: 3_000, limit: 2 }),
    highlighted.slice(0, 3),
  );
  assert.equal(
    hotspotOverviewLinks(links, { zoom: 1, totalLinkCount: 3_000, limit: 2 }),
    links,
  );
  assert.equal(
    hotspotOverviewLinks(links, { zoom: 0.5, totalLinkCount: 4, limit: 2 }),
    links,
  );
});

test('large fitted Hotspot selections draw only complete local node evidence', () => {
  const nodes = [
    { node: { id: 'selected' }, highlighted: true },
    { node: { id: 'neighbor' }, highlighted: true },
    { node: { id: 'background' }, highlighted: false },
  ];

  assert.deepEqual(
    hotspotOverviewNodes(nodes, { zoom: 0.5, totalNodeCount: 3_000 }),
    nodes.slice(0, 2),
  );
  assert.strictEqual(
    hotspotOverviewNodes(nodes, { zoom: 1, totalNodeCount: 3_000 }),
    nodes,
  );
  assert.strictEqual(
    hotspotOverviewNodes(nodes, { zoom: 0.5, totalNodeCount: 500 }),
    nodes,
  );
});

test('large fitted Impact overviews balance representative focus links deterministically', () => {
  const links = [
    { source: 'focus', target: 'z-callee', weight: 1, highlighted: false },
    { source: 'b-caller', target: 'focus', weight: 1, highlighted: false },
    { source: 'focus', target: 'a-callee', weight: 1, highlighted: false },
    { source: 'a-caller', target: 'focus', weight: 1, highlighted: false },
    { source: 'context-a', target: 'context-b', weight: 8, highlighted: false },
  ];

  assert.equal(impactOverviewActive({ zoom: 0.5, totalLinkCount: 1_000, limit: 4 }), true);
  assert.deepEqual(
    impactOverviewLinks(links, {
      zoom: 0.5, totalLinkCount: 1_000, focusId: 'focus', limit: 4,
    }),
    [links[3], links[2], links[1], links[0]],
  );
  assert.deepEqual(
    impactOverviewLinks([...links].reverse(), {
      zoom: 0.5, totalLinkCount: 1_000, focusId: 'focus', limit: 4,
    }),
    [links[3], links[2], links[1], links[0]],
  );
});

test('Impact overview keeps an exact highlighted path and reveals all links on zoom', () => {
  const links = [
    { source: 'caller', target: 'focus', highlighted: false },
    { source: 'focus', target: 'callee', highlighted: true },
    { source: 'callee', target: 'leaf', highlighted: true },
    { source: 'other', target: 'context', highlighted: false },
  ];

  assert.deepEqual(
    impactOverviewLinks(links, { zoom: 0.5, totalLinkCount: 1_000, focusId: 'focus', limit: 1 }),
    links.slice(1, 3),
  );
  assert.deepEqual(
    impactOverviewLinks(links, { zoom: 0.8, totalLinkCount: 1_000, focusId: 'focus', limit: 1 }),
    links.slice(1, 3),
  );
  assert.deepEqual(
    impactOverviewLinks(links, { zoom: 1.1, totalLinkCount: 1_000, focusId: 'focus', limit: 1 }),
    links.slice(1, 3),
  );
  const unhighlighted = links.map((link) => ({ ...link, highlighted: false }));
  assert.strictEqual(
    impactOverviewLinks(unhighlighted, {
      zoom: 1.1, totalLinkCount: 1_000, focusId: 'focus', limit: 1,
    }),
    unhighlighted,
  );
  assert.equal(impactOverviewActive({ zoom: 0.8, totalLinkCount: 1_000, limit: 1 }), true);
  assert.equal(impactOverviewActive({ zoom: 1.1, totalLinkCount: 1_000, limit: 1 }), false);
});
