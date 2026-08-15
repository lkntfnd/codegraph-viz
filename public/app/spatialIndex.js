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
  const territoryByNode = new Map();
  let maxRadius = 0;

  for (const node of indexed) {
    const box = node?.territory;
    const territory = box && [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)
      ? box
      : null;
    const radius = territory
      ? Math.hypot((territory.x1 - territory.x0) / 2, (territory.y1 - territory.y0) / 2)
      : Math.max(0, finite(radiusFor(node)));
    radiusByNode.set(node, radius);
    if (territory) territoryByNode.set(node, territory);
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
          const territory = territoryByNode.get(node);
          const contains = territory
            ? x >= territory.x0 && x <= territory.x1 && y >= territory.y0 && y <= territory.y1
            : distance <= radius * radius;
          if (contains && distance < nearestDistance) {
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
