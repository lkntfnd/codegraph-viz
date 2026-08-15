import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCallCyclePresentation,
  projectLargeCallCycles,
} from '../public/app/callCycleProjection.js';
import { build as buildModel } from '../public/app/graphModel.js';

function fixture() {
  return buildModel({
    nodes: ['focus', 'a', 'selected', 'b', 'c', 'outside', 'leaf'].map((id) => ({
      id,
      label: id,
      file: `src/${id}.mjs`,
      kind: 'function',
    })),
    edges: [
      { source: 'focus', target: 'a', kind: 'calls', weight: 1 },
      { source: 'a', target: 'selected', kind: 'calls', weight: 1 },
      { source: 'selected', target: 'b', kind: 'calls', weight: 1 },
      { source: 'b', target: 'c', kind: 'calls', weight: 1 },
      { source: 'c', target: 'focus', kind: 'calls', weight: 1 },
      { source: 'outside', target: 'a', kind: 'calls', weight: 2 },
      { source: 'b', target: 'leaf', kind: 'calls', weight: 3 },
    ],
  });
}

test('large loaded call cycles retain focus and selection behind an explicit summary', () => {
  const model = fixture();
  const projected = projectLargeCallCycles(model, {
    focusId: 'focus',
    selectedId: 'selected',
    threshold: 4,
  });
  const summary = projected.nodes.find((node) => node.cycleSummary);

  assert.deepEqual(projected.nodes.map((node) => node.id), [
    'focus', 'leaf', 'outside', 'selected', summary.id,
  ]);
  assert.deepEqual(summary, {
    id: summary.id,
    label: 'Cycle ×3',
    kind: 'cycle',
    cycleSummary: true,
    componentId: 'a',
    loadedComponentId: 'a',
    componentSize: 5,
    loadedComponentSize: 5,
    memberIds: ['a', 'b', 'c'],
    retainedMemberIds: ['focus', 'selected'],
    inCycle: true,
    size: 3,
  });
  assert.deepEqual(projected.collapsedComponents, [{
    id: 'a',
    summaryId: summary.id,
    members: ['a', 'b', 'c', 'focus', 'selected'],
    hiddenMemberIds: ['a', 'b', 'c'],
    retainedMemberIds: ['focus', 'selected'],
  }]);
  assert.deepEqual(
    projected.edges.map((edge) => [edge.source, edge.target, edge.weight, edge.relations]),
    [
      [summary.id, 'focus', 1, { calls: 1 }],
      [summary.id, 'leaf', 3, { calls: 3 }],
      [summary.id, 'selected', 1, { calls: 1 }],
      ['focus', summary.id, 1, { calls: 1 }],
      ['outside', summary.id, 2, { calls: 2 }],
      ['selected', summary.id, 1, { calls: 1 }],
    ],
  );
  assert.deepEqual(model.nodes.map((node) => node.id), ['focus', 'a', 'selected', 'b', 'c', 'outside', 'leaf']);
  assert.equal(model.links.length, 7);
});

test('expanded and below-threshold cycles preserve every loaded entity', () => {
  const model = fixture();
  const expanded = projectLargeCallCycles(model, {
    focusId: 'focus',
    selectedId: 'selected',
    threshold: 4,
    expandedComponentIds: ['a'],
  });
  const belowThreshold = projectLargeCallCycles(model, {
    focusId: 'focus',
    selectedId: 'selected',
    threshold: 5,
  });

  for (const projected of [expanded, belowThreshold]) {
    assert.equal(projected.collapsedComponents.length, 0);
    assert.deepEqual(projected.nodes.map((node) => node.id), [
      'a', 'b', 'c', 'focus', 'leaf', 'outside', 'selected',
    ]);
    assert.equal(projected.edges.length, 7);
    assert.ok(projected.nodes.every((node) => !node.cycleSummary));
  }
});

test('cycle summary projection is stable across API ordering', () => {
  const model = fixture();
  const reversed = {
    ...model,
    nodes: [...model.nodes].reverse(),
    links: [...model.links].reverse(),
  };
  const options = { focusId: 'focus', selectedId: 'selected', threshold: 4 };

  assert.deepEqual(projectLargeCallCycles(reversed, options), projectLargeCallCycles(model, options));
});

test('call presentation rebuilds valid projected indexes while retaining the full evidence model', () => {
  const fullModel = fixture();
  const presentation = buildCallCyclePresentation(fullModel, {
    focusId: 'focus',
    selectedId: 'selected',
    threshold: 4,
  });
  const summary = presentation.model.nodes.find((node) => node.cycleSummary);

  assert.strictEqual(presentation.fullModel, fullModel);
  assert.notStrictEqual(presentation.model, fullModel);
  assert.equal(presentation.collapsedComponents.length, 1);
  assert.equal(presentation.model.nodes.length, 5);
  assert.equal(presentation.model.links.length, 6);
  assert.equal(presentation.model.indexes.nodesById.get(summary.id), summary);
  assert.equal(summary.loadedComponentSize, 5);
  assert.deepEqual(summary.memberIds, ['a', 'b', 'c']);
  assert.ok(presentation.model.indexes.neighborsById.get('focus').has(summary.id));

  const complete = buildCallCyclePresentation(fullModel, {
    focusId: 'focus',
    threshold: 5,
  });
  assert.strictEqual(complete.model, fullModel);
  assert.deepEqual(complete.collapsedComponents, []);
});
