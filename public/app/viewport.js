const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function preserveViewportCenter(transform, previousSize, nextSize) {
  return {
    x: finite(transform?.x) + (finite(nextSize?.width) - finite(previousSize?.width)) / 2,
    y: finite(transform?.y) + (finite(nextSize?.height) - finite(previousSize?.height)) / 2,
    k: Math.max(0.0001, finite(transform?.k, 1)),
  };
}

export function cameraAfterViewportResize(transform, previousSize, nextSize) {
  return preserveViewportCenter(transform, previousSize, nextSize);
}

export function graphIntersectsViewport(nodes, transform, size) {
  const width = Math.max(0, finite(size?.width));
  const height = Math.max(0, finite(size?.height));
  const x = finite(transform?.x);
  const y = finite(transform?.y);
  const k = Math.max(0.0001, finite(transform?.k, 1));

  return (nodes || []).some((node) => {
    if (!Number.isFinite(node?.x) || !Number.isFinite(node?.y)) return false;
    const radius = Math.max(0, finite(node.radius)) * k;
    const screenX = node.x * k + x;
    const screenY = node.y * k + y;
    return screenX + radius >= 0
      && screenX - radius <= width
      && screenY + radius >= 0
      && screenY - radius <= height;
  });
}
