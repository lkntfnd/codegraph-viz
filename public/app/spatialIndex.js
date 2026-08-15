// public/app/spatialIndex.js — index graph geometry for pointer hit-testing.

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function buildNodeSpatialIndex(d3, nodes = [], radiusFor = () => 0) {
  if (typeof d3?.quadtree !== 'function') {
    throw new TypeError('buildNodeSpatialIndex requires d3.quadtree');
  }

  const indexed = nodes.filter(
    (node) => Number.isFinite(node?.x) && Number.isFinite(node?.y),
  );
  const radiusByNode = new Map();
  let maxRadius = 0;

  for (const node of indexed) {
    const radius = Math.max(0, finite(radiusFor(node)));
    radiusByNode.set(node, radius);
    maxRadius = Math.max(maxRadius, radius);
  }

  const tree = d3.quadtree(indexed, (node) => node.x, (node) => node.y);

  function find(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !indexed.length) return null;

    let nearest = null;
    let nearestDistance = Infinity;

    tree.visit((quad, x0, y0, x1, y1) => {
      const searchRadius = Math.min(maxRadius, Math.sqrt(nearestDistance));
      if (x0 > x + searchRadius || x1 < x - searchRadius
        || y0 > y + searchRadius || y1 < y - searchRadius) {
        return true;
      }

      if (!quad.length) {
        let leaf = quad;
        do {
          const node = leaf.data;
          const dx = x - node.x;
          const dy = y - node.y;
          const distance = dx * dx + dy * dy;
          const radius = radiusByNode.get(node);
          if (distance <= radius * radius && distance < nearestDistance) {
            nearest = node;
            nearestDistance = distance;
          }
          leaf = leaf.next;
        } while (leaf);
      }

      return false;
    });

    return nearest;
  }

  return { find, size: indexed.length };
}
