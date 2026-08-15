import test from 'node:test';
import assert from 'node:assert/strict';

import { createModeStateStore } from '../public/app/modeState.js';

test('mode state store keeps independent immutable navigation snapshots', () => {
  const store = createModeStateStore();
  store.save('architecture', {
    prefix: 'src/app', file: null, focus: null, selectedId: 'src/app',
    layoutId: 'territory',
    hiddenKinds: [' File ', 'folder', 'file'], hiddenCodeSets: ['Unknown', 'tests', 'invalid'],
    transform: { x: 12, y: 24, k: 1.5 },
  });
  store.save('callgraph', {
    prefix: '', file: null, focus: '42', selectedId: '42',
    callDepth: 4,
    callDirection: 'callers',
    expandedCallCycleIds: [' cycle-b ', 'cycle-a', 'cycle-b', ''],
    layoutId: 'radial-reach',
    transform: { x: -8, y: 4, k: 2 },
  });

  const architecture = store.restore('architecture');
  architecture.transform.k = 99;
  architecture.hiddenKinds.push('mutated');
  architecture.hiddenCodeSets.push('mutated');

  assert.deepEqual(store.restore('architecture'), {
    prefix: 'src/app', file: null, focus: null, selectedId: 'src/app',
    callDepth: 2,
    callDirection: 'both',
    layoutId: 'territory',
    hiddenKinds: ['file', 'folder'],
    hiddenCodeSets: ['tests', 'unknown'],
    expandedCallCycleIds: [],
    hiddenRelationKinds: [],
    minRelationWeight: 1,
    fileEvidence: 'all',
    fileDirection: 'both',
    minCouplingPercentile: 0,
    showExternal: true,
    transform: { x: 12, y: 24, k: 1.5 },
  });
  assert.equal(store.restore('callgraph').focus, '42');
  assert.equal(store.restore('callgraph').callDepth, 4);
  assert.equal(store.restore('callgraph').callDirection, 'callers');
  assert.equal(store.restore('callgraph').layoutId, 'radial-reach');
  const restoredCall = store.restore('callgraph');
  assert.deepEqual(restoredCall.expandedCallCycleIds, ['cycle-a', 'cycle-b']);
  restoredCall.expandedCallCycleIds.push('mutated');
  assert.deepEqual(store.restore('callgraph').expandedCallCycleIds, ['cycle-a', 'cycle-b']);
  assert.equal(store.restore('filedeps'), null);

  store.save('filedeps', {
    prefix: 'src', layoutId: 'dependency-matrix', hiddenRelationKinds: ['calls', ' imports '],
    selectedId: 'file-a', fileDirection: 'outgoing',
    showExternal: false,
    minRelationWeight: 4,
    fileEvidence: 'isolated',
    minCouplingPercentile: 75,
    transform: { x: 0, y: 0, k: 1 },
  });
  const filedeps = store.restore('filedeps');
  assert.deepEqual(filedeps.hiddenKinds, []);
  assert.deepEqual(filedeps.hiddenCodeSets, []);
  filedeps.hiddenRelationKinds.push('mutated');
  assert.deepEqual(store.restore('filedeps').hiddenRelationKinds, ['calls', 'imports']);
  assert.equal(store.restore('filedeps').minRelationWeight, 4);
  assert.equal(store.restore('filedeps').fileEvidence, 'isolated');
  assert.equal(store.restore('filedeps').selectedId, 'file-a');
  assert.equal(store.restore('filedeps').fileDirection, 'outgoing');
  assert.equal(store.restore('filedeps').minCouplingPercentile, 75);
  assert.equal(store.restore('filedeps').showExternal, false);
});
