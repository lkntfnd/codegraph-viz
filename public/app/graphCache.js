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

function capacity(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(1, Math.trunc(numeric)) : fallback;
}

function writeRecent(map, key, value, limit) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value);
}

function readRecent(map, key) {
  const value = map.get(key);
  if (value === undefined) return null;
  map.delete(key);
  map.set(key, value);
  return value;
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

export function createGraphCache(options = {}) {
  const graphs = new Map();
  const positions = new Map();
  const graphLimit = capacity(options.maxGraphs, 24);
  const positionLimit = capacity(options.maxPositions, 48);
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
      writeRecent(graphs, graphCacheKey(options), clone(data), graphLimit);
    },
    getData(options) {
      const data = readRecent(graphs, graphCacheKey(options));
      return data === null ? null : clone(data);
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
      writeRecent(positions, positionKey(options, layoutId), snapshot, positionLimit);
    },
    getPositions(options, layoutId) {
      const snapshot = readRecent(positions, positionKey(options, layoutId));
      if (!snapshot) return null;
      return new Map([...snapshot].map(([id, point]) => [id, { ...point }]));
    },
  };
}
