// public/app/layoutCamera.js — preserve camera transforms by view, layout, and scope.

function normalizePart(value) {
  return String(value ?? '').trim();
}

function normalizePath(value) {
  return normalizePart(value)
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/g, '');
}

function normalizedSet(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizePart(value).toLowerCase())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function boundedInteger(value, minimum, maximum, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(minimum, Math.floor(numeric)))
    : fallback;
}

function fileDirectionIdentity(state) {
  const direction = ['incoming', 'outgoing'].includes(state.fileDirection)
    ? state.fileDirection
    : 'both';
  return direction === 'both'
    ? { fileDirection: 'both', selectedFile: null }
    : { fileDirection: direction, selectedFile: normalizePart(state.selectedId) || null };
}

function cameraKey(view, layoutId, scope) {
  return JSON.stringify([normalizePart(view), normalizePart(layoutId), normalizePart(scope)]);
}

function normalizeTransform(transform = {}) {
  const x = Number(transform.x);
  const y = Number(transform.y);
  const k = Number(transform.k);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    k: Number.isFinite(k) && k > 0 ? k : 1,
  };
}

export function createLayoutCameraStore() {
  const cameras = new Map();
  return {
    save(view, layoutId, scope, transform) {
      const snapshot = normalizeTransform(transform);
      cameras.set(cameraKey(view, layoutId, scope), snapshot);
      return { ...snapshot };
    },
    restore(view, layoutId, scope) {
      const snapshot = cameras.get(cameraKey(view, layoutId, scope));
      return snapshot ? { ...snapshot } : null;
    },
  };
}

export function layoutCameraScope(state = {}) {
  const view = normalizePart(state.view || 'architecture');
  const hiddenKinds = normalizedSet(state.settings?.hiddenKinds);
  const hiddenCodeSets = normalizedSet(state.settings?.hiddenCodeSets);
  const showExternal = state.settings?.showExternal !== false;
  if (view === 'architecture') {
    const prefix = normalizePath(state.prefix);
    return hiddenKinds.length || hiddenCodeSets.length || !showExternal
      ? JSON.stringify({ prefix, hiddenKinds, hiddenCodeSets, showExternal })
      : prefix;
  }
  if (view === 'filedeps') {
    const evidence = ['all', 'cycles', 'isolated'].includes(state.fileEvidence)
      ? state.fileEvidence
      : 'all';
    return JSON.stringify({
      prefix: normalizePath(state.prefix),
      hiddenRelations: normalizedSet(state.hiddenRelationKinds),
      minWeight: boundedInteger(state.minRelationWeight, 1, 1_000_000, 1),
      evidence,
      minCoupling: evidence === 'all'
        ? boundedInteger(state.minCouplingPercentile, 0, 100, 0)
        : 0,
      hiddenKinds,
      hiddenCodeSets,
      showExternal,
      ...fileDirectionIdentity(state),
    });
  }
  const target = normalizePart(state.focus || state.file);
  const depth = normalizePart(state.callDepth);
  const direction = normalizePart(state.callDirection);
  const query = `${target}|${depth}|${direction}`;
  return hiddenKinds.length || hiddenCodeSets.length || !showExternal
    ? JSON.stringify({ query, hiddenKinds, hiddenCodeSets, showExternal })
    : query;
}
