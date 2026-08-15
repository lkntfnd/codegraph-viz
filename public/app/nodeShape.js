// public/app/nodeShape.js — map node kinds to restrained canvas shapes.

const KIND_SHAPES = Object.freeze({
  folder: 'container',
  module: 'container',
  file: 'file',
  function: 'callable',
  method: 'callable',
  class: 'type',
  interface: 'type',
  cycle: 'cycle',
});

function radiusValue(radius) {
  const value = Number(radius);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function nodeKindShape(node = {}) {
  if (node.external) return 'unknown';
  const kind = typeof node.kind === 'string' ? node.kind.trim().toLowerCase() : '';
  return KIND_SHAPES[kind] || 'unknown';
}

export function nodeShapePolygon(shape, radius) {
  const value = radiusValue(radius);
  if (shape === 'file') {
    const half = value / Math.SQRT2;
    return [[-half, -half], [half, -half], [half, half], [-half, half]];
  }
  if (shape === 'type') {
    return [[0, -value], [value, 0], [0, value], [-value, 0]];
  }
  if (shape === 'container') {
    return Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI / 6 + index * Math.PI / 3;
      return [Math.cos(angle) * value, Math.sin(angle) * value];
    });
  }
  if (shape === 'cycle') {
    return Array.from({ length: 8 }, (_, index) => {
      const angle = Math.PI / 8 + index * Math.PI / 4;
      return [Math.cos(angle) * value, Math.sin(angle) * value];
    });
  }
  return [];
}
