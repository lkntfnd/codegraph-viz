// public/app/forces.js — configure and retune the shared D3 force model.

const CENTER_MASS_FACTOR = 0.15;

function mass(node) {
  return Number.isFinite(node?.mass) && node.mass > 0 ? node.mass : 1;
}

function radius(node) {
  return Number.isFinite(node?.radius) && node.radius > 0 ? node.radius : 3;
}

const chargeStrength = (settings) => (node) => settings.repelForce * mass(node);

const centerStrength = (settings) => (node) => (
  settings.centerForce * (1 + CENTER_MASS_FACTOR * Math.log2(1 + mass(node)))
);

function requireD3(d3) {
  const required = [
    'forceSimulation',
    'forceLink',
    'forceManyBody',
    'forceX',
    'forceY',
    'forceCollide',
  ];
  const missing = required.filter((name) => typeof d3?.[name] !== 'function');
  if (missing.length) throw new TypeError(`Incomplete d3 force implementation: ${missing.join(', ')}`);
}

export function build(d3, nodes, links, settings, { cx = 0, cy = 0 } = {}) {
  requireD3(d3);

  return d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links)
      .id((node) => node.id)
      .distance(settings.linkDistance)
      .strength(settings.linkForce))
    .force('charge', d3.forceManyBody().strength(chargeStrength(settings)))
    .force('x', d3.forceX(cx).strength(centerStrength(settings)))
    .force('y', d3.forceY(cy).strength(centerStrength(settings)))
    .force('collide', d3.forceCollide().radius((node) => radius(node) + settings.collidePad))
    .velocityDecay(settings.velocityDecay)
    .alphaDecay(settings.alphaDecay);
}

export function apply(d3, simulation, settings, { cx = 0, cy = 0 } = {}) {
  requireD3(d3);

  simulation.force('charge').strength(chargeStrength(settings));
  simulation.force('link')
    .distance(settings.linkDistance)
    .strength(settings.linkForce);
  simulation.force('x')
    .x(cx)
    .strength(centerStrength(settings));
  simulation.force('y')
    .y(cy)
    .strength(centerStrength(settings));
  simulation.force('collide')
    .radius((node) => radius(node) + settings.collidePad);
  simulation
    .velocityDecay(settings.velocityDecay)
    .alphaDecay(settings.alphaDecay)
    .alpha(Math.max(0.3, simulation.alpha()))
    .alphaTarget(0)
    .restart();
}
