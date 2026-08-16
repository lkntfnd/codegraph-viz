import test from 'node:test';
import assert from 'node:assert/strict';
import * as d3 from 'd3';

import { buildNodeSpatialIndex } from '../public/app/spatialIndex.js';

test('spatial index returns the nearest node whose radius contains the point', () => {
  const nodes = [
    { id: 'small', x: 0, y: 0, radius: 2 },
    { id: 'large', x: 6, y: 0, radius: 8 },
    { id: 'invalid', x: Number.NaN, y: 0, radius: 100 },
  ];
  const index = buildNodeSpatialIndex(d3, nodes, (node) => node.radius);

  assert.equal(index.find(1, 0)?.id, 'small');
  assert.equal(index.find(8, 0)?.id, 'large');
  assert.equal(index.find(30, 0), null);
  assert.equal(index.size, 2);
});
