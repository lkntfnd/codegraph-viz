import test from 'node:test';
import assert from 'node:assert/strict';

import { activationFor, pendingSelectionCameraAction } from '../public/app/nodeActivation.js';

test('node activation separates selection, repeated clicks, drill, and background', () => {
  assert.equal(activationFor({ type: 'click', detail: 1 }, true), 'select');
  assert.equal(activationFor({ type: 'click', detail: 2 }, true), 'ignore');
  assert.equal(activationFor({ type: 'dblclick', detail: 2 }, true), 'drill');
  assert.equal(activationFor({ type: 'click', detail: 1 }, false), 'background');
  assert.equal(activationFor({ type: 'dblclick', detail: 2 }, false), 'ignore');
});

test('a freshly loaded Call focus preserves the completed layout fit', () => {
  assert.equal(pendingSelectionCameraAction('callgraph', 'focus', 'focus'), 'preserve-fit');
  assert.equal(pendingSelectionCameraAction('callgraph', 'caller', 'focus'), 'center');
  assert.equal(pendingSelectionCameraAction('filedeps', 'file', 'file'), 'center');
  assert.equal(pendingSelectionCameraAction('callgraph', '', ''), 'center');
});
