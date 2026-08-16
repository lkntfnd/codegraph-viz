import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as d3 from 'd3';

import { build as buildForces } from '../public/app/forces.js';
import { build as buildModel } from '../public/app/graphModel.js';
import { DEFAULTS } from '../public/app/settings.js';
import { apiData } from './fixtures/graph.mjs';

test('the shipped force model converges to finite, non-degenerate positions', () => {
  const model = buildModel({
    ...apiData,
    nodes: [
      ...apiData.nodes,
      { id: 'disconnected', label: 'orphan.js', kind: 'file' },
    ],
    edges: [
      ...apiData.edges,
      { source: 'a', target: 'truncated-away' },
    ],
  });
  const simulation = buildForces(d3, model.nodes, model.links, DEFAULTS, { cx: 0, cy: 0 }).stop();

  let ticks = 0;
  while (simulation.alpha() > simulation.alphaMin() && ticks < 1_000) {
    simulation.tick();
    ticks += 1;
  }

  assert.ok(ticks < 1_000, 'simulation did not converge');
  assert.ok(model.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.ok(model.nodes.find((node) => node.id === 'disconnected'));
  assert.equal(model.links.length, apiData.edges.length);

  const xs = model.nodes.map((node) => node.x);
  const ys = model.nodes.map((node) => node.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 1);
});
