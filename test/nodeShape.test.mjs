import test from 'node:test';
import assert from 'node:assert/strict';

import { nodeKindShape, nodeShapePolygon } from '../public/app/nodeShape.js';

test('node kinds normalize into restrained semantic shape families', () => {
  assert.equal(nodeKindShape({ kind: ' folder ' }), 'container');
  assert.equal(nodeKindShape({ kind: 'MODULE' }), 'container');
  assert.equal(nodeKindShape({ kind: 'file' }), 'file');
  assert.equal(nodeKindShape({ kind: 'function' }), 'callable');
  assert.equal(nodeKindShape({ kind: 'method' }), 'callable');
  assert.equal(nodeKindShape({ kind: 'class' }), 'type');
  assert.equal(nodeKindShape({ kind: 'interface' }), 'type');
  assert.equal(nodeKindShape({ kind: 'cycle' }), 'cycle');
  assert.equal(nodeKindShape({ kind: 'methodology' }), 'unknown');
  assert.equal(nodeKindShape({ kind: 'class', external: true }), 'unknown');
});

test('polygonal node shapes remain inside the shared circular hit radius', () => {
  for (const shape of ['container', 'file', 'type', 'cycle']) {
    const points = nodeShapePolygon(shape, 12);
    assert.ok(points.length >= 4);
    assert.ok(points.every(([x, y]) => Math.hypot(x, y) <= 12 + Number.EPSILON));
  }
  assert.equal(nodeShapePolygon('cycle', 12).length, 8);
  assert.deepEqual(nodeShapePolygon('callable', 12), []);
  assert.deepEqual(nodeShapePolygon('unknown', 12), []);
});

test('shape geometry is finite and defensive for invalid radii', () => {
  assert.ok(nodeShapePolygon('container', Number.NaN).flat().every(Number.isFinite));
  assert.ok(nodeShapePolygon('file', -20).flat().every(Number.isFinite));
});
