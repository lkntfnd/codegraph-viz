// public/app/graphQuery.js — normalize browser graph request options.

export const DEFAULT_CALL_DEPTH = 2;
export const MIN_CALL_DEPTH = 1;
export const MAX_CALL_DEPTH = 5;
export const DEFAULT_CALL_DIRECTION = 'both';
export const CALL_DIRECTIONS = Object.freeze(['callers', 'both', 'callees']);

export function normalizeCallDepth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_CALL_DEPTH;
  return Math.min(MAX_CALL_DEPTH, Math.max(MIN_CALL_DEPTH, Math.trunc(numeric)));
}

export function normalizeCallDirection(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return CALL_DIRECTIONS.includes(normalized) ? normalized : DEFAULT_CALL_DIRECTION;
}

export function buildGraphOptions(state = {}) {
  const view = state.view || 'architecture';
  const options = { view };

  if ((view === 'architecture' || view === 'filedeps') && state.prefix) {
    options.prefix = state.prefix;
  }

  if (view === 'architecture' && state.layoutId === 'structure-tree') {
    options.recursive = 1;
  }

  if (view === 'callgraph') {
    if (state.file) options.file = state.file;
    if (state.focus) {
      options.focus = state.focus;
      options.depth = normalizeCallDepth(state.callDepth);
      options.direction = normalizeCallDirection(state.callDirection);
    }
  }

  return options;
}
