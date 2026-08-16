import test from 'node:test';
import assert from 'node:assert/strict';

import { build } from '../public/app/graphModel.js';
import { buildCallCyclePresentation } from '../public/app/callCycleProjection.js';
import {
  cycleEvidenceCopy,
  describeCallCycleSummary,
  describeImpactReach,
  describeSelection,
} from '../public/app/inspector.js';
import { apiData } from './fixtures/graph.mjs';

test('describeSelection exposes identity and direct directional relationships', () => {
  const model = build(apiData);

  assert.deepEqual(describeSelection(model, 'a'), {
    id: 'a',
    label: 'a.js',
    kind: 'file',
    path: 'src/a.js',
    external: false,
    coupling: {
      weightedInbound: 0,
      weightedOutbound: 3,
      total: 3,
      percentile: 100,
    },
    cycle: null,
    inbound: [],
    outbound: [
      { nodeId: 'b', label: 'b.js', kind: 'file', relation: null, weight: 2 },
      { nodeId: 'c', label: 'c.js', kind: 'file', relation: null, weight: 1 },
    ],
  });
  assert.equal(describeSelection(model, 'missing'), null);
});

test('describeSelection explains strongly connected cycle membership', () => {
  const model = build({
    nodes: [
      { id: 'a', label: 'alpha.mjs', kind: 'file', path: 'src/alpha.mjs' },
      { id: 'b', label: 'beta.mjs', kind: 'file', path: 'src/beta.mjs' },
      { id: 'c', label: 'context.mjs', kind: 'file', path: 'src/context.mjs' },
    ],
    edges: [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
      { source: 'b', target: 'c' },
    ],
  });

  assert.deepEqual(describeSelection(model, 'b').cycle, {
    componentId: 'a',
    size: 2,
    members: [
      { nodeId: 'a', label: 'alpha.mjs' },
      { nodeId: 'b', label: 'beta.mjs' },
    ],
  });
  assert.equal(describeSelection(model, 'c').cycle, null);
});

test('describeCallCycleSummary restores exact full-model membership and summary counts', () => {
  const fullModel = build({
    nodes: ['focus', 'alpha', 'beta', 'outside'].map((id) => ({
      id, label: id, kind: 'function', file: `src/${id}.mjs`,
    })),
    edges: [
      { source: 'focus', target: 'alpha', kind: 'calls' },
      { source: 'alpha', target: 'beta', kind: 'calls' },
      { source: 'beta', target: 'focus', kind: 'calls' },
      { source: 'outside', target: 'alpha', kind: 'calls' },
    ],
  });
  const presentation = buildCallCyclePresentation(fullModel, {
    focusId: 'focus', threshold: 2,
  });
  const summary = presentation.model.nodes.find((node) => node.cycleSummary);
  const details = describeCallCycleSummary(presentation.model, fullModel, summary.id);

  assert.equal(details.id, summary.id);
  assert.equal(details.label, '2 loaded cycle members');
  assert.equal(details.kind, 'Loaded cycle summary');
  assert.equal(details.path, null);
  assert.deepEqual(details.summary, {
    componentId: 'alpha',
    hiddenCount: 2,
    loadedCount: 3,
    retainedCount: 1,
  });
  assert.deepEqual(details.cycle, {
    componentId: 'alpha',
    size: 3,
    members: [
      { nodeId: 'alpha', label: 'alpha' },
      { nodeId: 'beta', label: 'beta' },
      { nodeId: 'focus', label: 'focus' },
    ],
  });
  assert.equal(describeCallCycleSummary(presentation.model, fullModel, 'focus'), null);
});

test('cycle evidence language distinguishes file dependencies from loaded call traces', () => {
  assert.deepEqual(cycleEvidenceCopy('filedeps', 2), {
    title: 'Dependency cycle',
    description: '2 files in one strongly connected group',
    caveat: 'Loaded scope only. Membership indicates mutual reachability.',
    ariaLabel: 'Dependency cycle evidence',
  });
  assert.deepEqual(cycleEvidenceCopy('callgraph', 1), {
    title: 'Loaded call cycle',
    description: '1 symbol in one strongly connected group',
    caveat: 'Loaded trace only. Membership does not prove runtime recursion.',
    ariaLabel: 'Loaded call cycle evidence',
  });
});

test('describeSelection exposes explicit Structure-tree path and child composition', () => {
  const model = build({
    nodes: [
      { id: '.', label: 'root', kind: 'folder', path: '', parent: null, size: 7 },
      { id: 'src', label: 'src', kind: 'folder', path: 'src', parent: '.', size: 5 },
      { id: 'src/app.js', label: 'app.js', kind: 'file', path: 'src/app.js', parent: 'src', size: 5 },
    ],
    edges: [
      { source: '.', target: 'src', kind: 'contains' },
      { source: 'src', target: 'src/app.js', kind: 'contains' },
    ],
  });
  model.indexes.nodesById.get('.').treeDepth = 0;
  model.indexes.nodesById.get('src').treeDepth = 1;

  assert.deepEqual(describeSelection(model, '.'), {
    id: '.',
    label: 'root',
    kind: 'folder',
    path: '.',
    external: false,
    coupling: {
      weightedInbound: 0,
      weightedOutbound: 1,
      total: 1,
      percentile: 67,
    },
    cycle: null,
    hierarchy: {
      depth: 0,
      parentId: null,
      parentLabel: null,
      directChildren: 1,
      folderChildren: 1,
      fileChildren: 0,
      symbolCount: 7,
    },
    inbound: [],
    outbound: [
      { nodeId: 'src', label: 'src', kind: 'folder', relation: 'contains', weight: 1 },
    ],
  });
});

test('describeImpactReach separates direct and transitive symbols and unique files', () => {
  const model = build({
    nodes: [
      { id: 'focus', kind: 'function', file: 'src/focus.js' },
      { id: 'caller-a', kind: 'function', file: 'src/callers.js' },
      { id: 'caller-b', kind: 'method', file: 'src/callers.js' },
      { id: 'caller-c', kind: 'function', file: 'test/focus.test.js' },
      { id: 'callee-a', kind: 'function', file: 'src/dependency.js' },
      { id: 'callee-b', kind: 'method', file: 'vendor/library.js' },
    ],
    edges: [
      { source: 'caller-a', target: 'focus', kind: 'calls' },
      { source: 'caller-b', target: 'caller-a', kind: 'calls' },
      { source: 'caller-c', target: 'caller-b', kind: 'calls' },
      { source: 'focus', target: 'callee-a', kind: 'calls' },
      { source: 'callee-a', target: 'callee-b', kind: 'calls' },
    ],
  });

  assert.deepEqual(describeImpactReach(model, 'focus'), {
    callers: {
      direct: 1,
      transitive: 2,
      total: 3,
      files: ['src/callers.js', 'test/focus.test.js'],
      fileCount: 2,
    },
    callees: {
      direct: 1,
      transitive: 1,
      total: 2,
      files: ['src/dependency.js', 'vendor/library.js'],
      fileCount: 2,
    },
  });
});

test('describeImpactReach is cycle-safe and excludes the selected symbol', () => {
  const model = build({
    nodes: [
      { id: 'focus', kind: 'function', file: 'src/focus.js' },
      { id: 'peer', kind: 'function', file: 'src/peer.js' },
    ],
    edges: [
      { source: 'focus', target: 'peer' },
      { source: 'peer', target: 'focus' },
    ],
  });

  assert.deepEqual(describeImpactReach(model, 'focus'), {
    callers: { direct: 1, transitive: 0, total: 1, files: ['src/peer.js'], fileCount: 1 },
    callees: { direct: 1, transitive: 0, total: 1, files: ['src/peer.js'], fileCount: 1 },
  });
  assert.equal(describeImpactReach(model, 'missing'), null);
});
