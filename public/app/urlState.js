import {
  DEFAULT_CALL_DEPTH,
  DEFAULT_CALL_DIRECTION,
  normalizeCallDepth,
  normalizeCallDirection,
} from './graphQuery.js';
import { defaultLayoutId, normalizeLayoutId } from './layoutRegistry.js';
import { normalizeFileEvidence, normalizeMinimumCouplingPercentile } from './fileEvidence.js';
import { normalizeCodeSets } from './codeSet.js';
import { normalizeFileDirection } from './fileDirection.js';

const VIEWS = new Set(['architecture', 'filedeps', 'callgraph']);

function clean(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replaceAll('\0', '').trim().slice(0, 2048);
  return normalized || null;
}

function normalizeView(value) {
  const view = clean(value);
  return VIEWS.has(view) ? view : 'architecture';
}

function normalizeHiddenKinds(values) {
  return [...new Set(values
    .map(clean)
    .filter(Boolean)
    .map((value) => value.toLowerCase().slice(0, 128)))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 64);
}

export function normalizeMinimumRelationWeight(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(1_000_000, Math.max(1, Math.floor(numeric)))
    : 1;
}

export function parseGraphHash(hash = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const view = normalizeView(params.get('view'));
  const layoutId = normalizeLayoutId(view, params.get('layout'));
  const result = {
    view,
    layoutId,
    prefix: '',
    file: null,
    focus: null,
    callDepth: DEFAULT_CALL_DEPTH,
    callDirection: DEFAULT_CALL_DIRECTION,
    selectedId: null,
    fileDirection: 'both',
    hiddenKinds: normalizeHiddenKinds(params.getAll('hide-kind')),
    hiddenCodeSets: normalizeCodeSets(params.getAll('hide-set')),
    hiddenRelationKinds: [],
    minRelationWeight: 1,
    fileEvidence: 'all',
    minCouplingPercentile: 0,
    showExternal: true,
  };

  if (view === 'architecture' || view === 'filedeps') {
    result.prefix = clean(params.get('prefix')) || '';
    if (view === 'filedeps') {
      const selectedId = clean(params.get('selected'));
      const fileDirection = normalizeFileDirection(params.get('file-direction'));
      if (selectedId && fileDirection !== 'both') {
        result.selectedId = selectedId;
        result.fileDirection = fileDirection;
      }
      result.hiddenRelationKinds = normalizeHiddenKinds(params.getAll('hide'));
      result.minRelationWeight = normalizeMinimumRelationWeight(params.get('min'));
      result.fileEvidence = normalizeFileEvidence(params.get('evidence'));
      if (result.fileEvidence === 'all') {
        result.minCouplingPercentile = normalizeMinimumCouplingPercentile(params.get('coupling'));
      }
    }
  } else {
    result.file = clean(params.get('file'));
    result.focus = clean(params.get('focus'));
    if (result.focus) {
      result.callDepth = normalizeCallDepth(params.get('depth'));
      result.callDirection = normalizeCallDirection(params.get('direction'));
      result.selectedId = clean(params.get('selected'));
    }
  }
  if (view === 'filedeps' || view === 'callgraph') {
    result.showExternal = params.get('external') !== '0';
  }
  return result;
}

export function serializeGraphHash(state = {}) {
  const view = normalizeView(state.view);
  const layoutId = normalizeLayoutId(view, state.layoutId || defaultLayoutId(view));
  const params = new URLSearchParams();
  params.set('view', view);
  params.set('layout', layoutId);
  if (view === 'filedeps' || view === 'callgraph') {
    const showExternal = state.settings?.showExternal ?? state.showExternal;
    params.set('external', showExternal === false ? '0' : '1');
  }
  for (const kind of normalizeHiddenKinds(state.settings?.hiddenKinds ?? state.hiddenKinds ?? [])) {
    params.append('hide-kind', kind);
  }
  for (const codeSet of normalizeCodeSets(state.settings?.hiddenCodeSets ?? state.hiddenCodeSets ?? [])) {
    params.append('hide-set', codeSet);
  }

  if (view === 'architecture' || view === 'filedeps') {
    const prefix = clean(state.prefix);
    if (prefix) params.set('prefix', prefix);
    if (view === 'filedeps') {
      const selectedId = clean(state.selectedId);
      const fileDirection = normalizeFileDirection(state.fileDirection);
      if (selectedId && fileDirection !== 'both') {
        params.set('selected', selectedId);
        params.set('file-direction', fileDirection);
      }
      for (const kind of normalizeHiddenKinds(state.hiddenRelationKinds ?? [])) {
        params.append('hide', kind);
      }
      const minimumWeight = normalizeMinimumRelationWeight(state.minRelationWeight);
      if (minimumWeight > 1) params.set('min', String(minimumWeight));
      const evidence = normalizeFileEvidence(state.fileEvidence);
      if (evidence !== 'all') params.set('evidence', evidence);
      if (evidence === 'all') {
        const coupling = normalizeMinimumCouplingPercentile(state.minCouplingPercentile);
        if (coupling > 0) params.set('coupling', String(coupling));
      }
    }
  } else {
    const file = clean(state.file);
    const focus = clean(state.focus);
    if (file) params.set('file', file);
    if (focus) {
      params.set('focus', focus);
      params.set('depth', String(normalizeCallDepth(state.callDepth)));
      params.set('direction', normalizeCallDirection(state.callDirection));
      const selectedId = clean(state.selectedId);
      if (selectedId && selectedId !== focus) params.set('selected', selectedId);
    }
  }
  return `#${params.toString()}`;
}

export function investigationUrl(locationLike = {}) {
  const origin = String(locationLike.origin || '');
  if (!origin || origin === 'null') throw new TypeError('Investigation URL is unavailable');
  return `${origin}${String(locationLike.pathname || '/')}${String(locationLike.search || '')}${String(locationLike.hash || '')}`;
}
