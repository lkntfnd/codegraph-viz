import test from 'node:test';
import assert from 'node:assert/strict';

import { directionalNodeId } from '../public/app/graphKeyboard.js';

const nodes = [
  { id: 'center', x: 0, y: 0 },
  { id: 'focus', x: 10, y: 10, focus: true },
  { id: 'right', x: 90, y: 4 },
  { id: 'diagonal', x: 40, y: 40 },
  { id: 'left', x: -70, y: 0 },
  { id: 'up', x: 0, y: -80 },
  { id: 'down', x: 0, y: 85 },
];

test('first graph arrow selects focus, then falls back to the layout center', () => {
  assert.equal(directionalNodeId(nodes, null, 'ArrowRight'), 'focus');
  assert.equal(
    directionalNodeId(nodes.map((node) => ({ ...node, focus: false })), null, 'ArrowRight'),
    'center',
  );
});

test('graph arrows prefer aligned nodes in the requested direction', () => {
  assert.equal(directionalNodeId(nodes, 'center', 'ArrowRight'), 'right');
  assert.equal(directionalNodeId(nodes, 'center', 'ArrowLeft'), 'left');
  assert.equal(directionalNodeId(nodes, 'center', 'ArrowUp'), 'up');
  assert.equal(directionalNodeId(nodes, 'center', 'ArrowDown'), 'down');
});

test('graph direction traversal is stable and defensive', () => {
  assert.equal(directionalNodeId(nodes, 'right', 'ArrowRight'), 'right');
  assert.equal(directionalNodeId(nodes, 'missing', 'ArrowRight'), 'focus');
  assert.equal(directionalNodeId([{ id: 'bad', x: Number.NaN, y: 1 }], null, 'ArrowRight'), null);
  assert.equal(directionalNodeId(nodes, 'center', 'Enter'), null);
});
