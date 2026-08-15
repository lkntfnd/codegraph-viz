import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLayoutCameraStore,
  layoutCameraScope,
} from '../public/app/layoutCamera.js';

test('layout camera store isolates view, layout, and scope with defensive transforms', () => {
  const store = createLayoutCameraStore();
  store.save('filedeps', 'hotspot-landscape', 'src', { x: 12, y: -4, k: 1.8 });
  store.save('filedeps', 'dependency-matrix', 'src', { x: -20, y: 8, k: 0.7 });
  store.save('filedeps', 'hotspot-landscape', 'test', { x: 3, y: 5, k: 2 });

  const hotspot = store.restore('filedeps', 'hotspot-landscape', 'src');
  hotspot.x = 999;
  assert.deepEqual(store.restore('filedeps', 'hotspot-landscape', 'src'), { x: 12, y: -4, k: 1.8 });
  assert.deepEqual(store.restore('filedeps', 'dependency-matrix', 'src'), { x: -20, y: 8, k: 0.7 });
  assert.deepEqual(store.restore('filedeps', 'hotspot-landscape', 'test'), { x: 3, y: 5, k: 2 });
  assert.equal(store.restore('architecture', 'territory', 'src'), null);
});

test('layout camera scope tracks every graph-changing semantic identity', () => {
  assert.equal(layoutCameraScope({ view: 'architecture', prefix: '\\src\\app\\' }), 'src/app');
  const fileScope = layoutCameraScope({
    view: 'filedeps',
    prefix: 'src',
    hiddenRelationKinds: [' Imports ', 'calls', 'calls'],
    minRelationWeight: 4,
    fileEvidence: 'all',
    minCouplingPercentile: 90,
    fileDirection: 'incoming',
    selectedId: 'file-a',
    settings: { hiddenKinds: ['Class', 'file'], hiddenCodeSets: ['Vendor', 'tests'], showExternal: false },
  });
  assert.equal(fileScope, JSON.stringify({
    prefix: 'src',
    hiddenRelations: ['calls', 'imports'],
    minWeight: 4,
    evidence: 'all',
    minCoupling: 90,
    hiddenKinds: ['class', 'file'],
    hiddenCodeSets: ['tests', 'vendor'],
    showExternal: false,
    fileDirection: 'incoming',
    selectedFile: 'file-a',
  }));
  assert.equal(fileScope, layoutCameraScope({
    view: 'filedeps',
    prefix: '/src/',
    hiddenRelationKinds: ['calls', 'imports'],
    minRelationWeight: 4,
    fileEvidence: 'all',
    minCouplingPercentile: 90,
    fileDirection: 'incoming',
    selectedId: 'file-a',
    settings: { hiddenKinds: ['file', 'class'], hiddenCodeSets: ['tests', 'vendor'], showExternal: false },
  }));
  assert.notEqual(fileScope, layoutCameraScope({
    view: 'filedeps', prefix: 'src', hiddenRelationKinds: ['calls'], minRelationWeight: 4,
    fileEvidence: 'all', minCouplingPercentile: 90,
    settings: { hiddenKinds: ['class', 'file'], showExternal: false },
  }));
  assert.equal(layoutCameraScope({
    view: 'callgraph',
    focus: 'symbol:7',
    callDepth: 3,
    callDirection: 'callers',
  }), 'symbol:7|3|callers');
});
