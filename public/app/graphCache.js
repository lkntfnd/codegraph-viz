// public/app/graphCache.js — cache graph responses and layout positions by scope.

function normalizedOptions(options = {}) {
  const entries = Object.entries({ view: 'architecture', ...options })
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [String(key), String(value)])
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function clone(value) {
  return structuredClone(value);
}

function positionKey(options, layoutId) {
  return JSON.stringify([graphCacheKey(options), String(layoutId || '')]);
}

export function graphCacheKey(options = {}) {
  return JSON.stringify(normalizedOptions(options));
}

export function applyCachedPositions(nodes = [], snapshot = null) {
  if (!snapshot) return 0;
  let restored = 0;
  for (const node of nodes) {
    const point = snapshot.get(String(node.id));
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    node.x = point.x;
    node.y = point.y;
    node.vx = Number.isFinite(point.vx) ? point.vx : 0;
    node.vy = Number.isFinite(point.vy) ? point.vy : 0;
    restored += 1;
  }
  return restored;
}

export function createGraphCache() {
  const graphs = new Map();
  const positions = new Map();
  let version;

  function clear() {
    graphs.clear();
    positions.clear();
  }

  return {
    clear,
    setVersion(nextVersion) {
      if (nextVersion === undefined || nextVersion === null) return false;
      if (version === undefined) {
        version = nextVersion;
        return false;
      }
      if (Object.is(version, nextVersion)) return false;
      version = nextVersion;
      clear();
      return true;
    },
    setData(options, data) {
      graphs.set(graphCacheKey(options), clone(data));
    },
    getData(options) {
      const data = graphs.get(graphCacheKey(options));
      return data === undefined ? null : clone(data);
    },
    savePositions(options, layoutId, nodes = []) {
      const snapshot = new Map();
      for (const node of nodes) {
        const x = Number(node?.x);
        const y = Number(node?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const vx = Number(node?.vx);
        const vy = Number(node?.vy);
        snapshot.set(String(node.id), {
          x,
          y,
          vx: Number.isFinite(vx) ? vx : 0,
          vy: Number.isFinite(vy) ? vy : 0,
        });
      }
      positions.set(positionKey(options, layoutId), snapshot);
    },
    getPositions(options, layoutId) {
      const snapshot = positions.get(positionKey(options, layoutId));
      if (!snapshot) return null;
      return new Map([...snapshot].map(([id, point]) => [id, { ...point }]));
    },
  };
}
