import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as d3 from 'd3';

import { build, apply } from '../public/app/forces.js';
import { DEFAULTS } from '../public/app/settings.js';

function fixture() {
  return {
    nodes: [
      { id: 'hub', mass: 3, radius: 8 },
      { id: 'leaf', mass: 1, radius: 4 },
    ],
    links: [{ source: 'hub', target: 'leaf', weight: 2 }],
  };
}

test('build configures the documented force model from injected d3', (t) => {
  const { nodes, links } = fixture();
  const simulation = build(d3, nodes, links, DEFAULTS, { cx: 120, cy: 80 });
  t.after(() => simulation.stop());

  assert.equal(simulation.nodes(), nodes);
  assert.equal(simulation.force('charge').strength()(nodes[0]), -660);
  assert.equal(simulation.force('link').distance()(links[0]), 55);
  assert.equal(simulation.force('link').strength()(links[0]), 0.35);
  assert.equal(simulation.force('collide').radius()(nodes[0]), 10);
  assert.equal(simulation.force('x').x()(nodes[0]), 120);
  assert.equal(simulation.force('y').y()(nodes[0]), 80);
  assert.equal(simulation.force('x').strength()(nodes[0]), 0.065);
  assert.equal(simulation.velocityDecay(), 0.35);
  assert.equal(simulation.alphaDecay(), 0.0228);
});

test('apply retunes the existing simulation without replacing nodes or forces', (t) => {
  const { nodes, links } = fixture();
  const simulation = build(d3, nodes, links, DEFAULTS, { cx: 120, cy: 80 });
  t.after(() => simulation.stop());
  const originalNodes = simulation.nodes();
  const originalLink = simulation.force('link');
  const originalCharge = simulation.force('charge');

  apply(d3, simulation, {
    ...DEFAULTS,
    centerForce: 0.1,
    repelForce: -100,
    linkForce: 0.6,
    linkDistance: 100,
    collidePad: 4,
    velocityDecay: 0.5,
    alphaDecay: 0.05,
  }, { cx: 200, cy: 150 });

  assert.equal(simulation.nodes(), originalNodes);
  assert.equal(simulation.force('link'), originalLink);
  assert.equal(simulation.force('charge'), originalCharge);
  assert.equal(originalCharge.strength()(nodes[0]), -300);
  assert.equal(originalLink.distance()(links[0]), 100);
  assert.equal(originalLink.strength()(links[0]), 0.6);
  assert.equal(simulation.force('collide').radius()(nodes[0]), 12);
  assert.equal(simulation.force('x').x()(nodes[0]), 200);
  assert.equal(simulation.force('y').y()(nodes[0]), 150);
  assert.equal(simulation.force('x').strength()(nodes[0]), 0.13);
  assert.equal(simulation.velocityDecay(), 0.5);
  assert.equal(simulation.alphaDecay(), 0.05);
  assert.ok(simulation.alpha() >= 0.3);
});
