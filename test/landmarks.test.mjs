import test from 'node:test';
import assert from 'node:assert/strict';

import { landmarkBudget, selectLandmarkIds } from '../public/app/landmarks.js';

test('overview landmark budgets stay between 8 and 16 across viewports', () => {
  assert.equal(landmarkBudget({ width: 320 }), 8);
  assert.equal(landmarkBudget({ width: 1440 }), 12);
  assert.equal(landmarkBudget({ width: 2400 }), 16);
  assert.equal(landmarkBudget({ width: Number.NaN }), 8);
});

test('Architecture landmarks prefer structural folders before large leaf files', () => {
  const nodes = [
    { id: 'huge.js', kind: 'file', size: 10_000, degree: 20 },
    { id: 'src', kind: 'folder', size: 20, degree: 2, expandable: true },
    { id: 'test', kind: 'folder', size: 10, degree: 1, expandable: true },
    { id: 'small.js', kind: 'file', size: 1, degree: 1 },
  ];
  assert.deepEqual(selectLandmarkIds(nodes, 'architecture', 3), ['src', 'test', 'huge.js']);
});

test('File-dependency landmarks rank measured coupling with cycle as evidence tie-break', () => {
  const nodes = [
    { id: 'quiet-cycle', coupling: 1, couplingPercentile: 20, inCycle: true },
    { id: 'hub-b', coupling: 20, couplingPercentile: 90, inCycle: true },
    { id: 'hub-a', coupling: 20, couplingPercentile: 90, inCycle: false },
    { id: 'middle', coupling: 8, couplingPercentile: 60, inCycle: false },
  ];
  assert.deepEqual(selectLandmarkIds(nodes, 'filedeps', 3), ['hub-b', 'hub-a', 'middle']);
});

test('Call-graph landmarks retain focus and direct reach before distant context', () => {
  const nodes = [
    { id: 'depth-2', relationDepth: 2, degree: 20 },
    { id: 'direct-b', relationDepth: 1, degree: 4, relationRole: 'outbound' },
    { id: 'focus', focus: true, relationDepth: 0, degree: 2 },
    { id: 'direct-a', relationDepth: 1, degree: 8, relationRole: 'inbound' },
  ];
  assert.deepEqual(selectLandmarkIds(nodes, 'callgraph', 3), ['focus', 'direct-a', 'direct-b']);
});

test('landmark selection is bounded, stable, and defensive', () => {
  const nodes = Array.from({ length: 24 }, (_, index) => ({ id: `node-${String(index).padStart(2, '0')}` }));
  const first = selectLandmarkIds(nodes, 'unknown', 99);
  const second = selectLandmarkIds([...nodes].reverse(), 'unknown', 99);
  assert.equal(first.length, 16);
  assert.deepEqual(first, second);
  assert.equal(selectLandmarkIds(nodes, 'unknown', 1).length, 1);
});
