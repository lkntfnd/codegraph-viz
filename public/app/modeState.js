// public/app/modeState.js — preserve independent navigation state for each view.

import { normalizeCallDepth, normalizeCallDirection } from './graphQuery.js';
import { normalizeLayoutId } from './layoutRegistry.js';
import { normalizeFileEvidence, normalizeMinimumCouplingPercentile } from './fileEvidence.js';
import { normalizeCodeSets } from './codeSet.js';
import { normalizeFileDirection } from './fileDirection.js';

function cloneSnapshot(snapshot, mode) {
  const hiddenKinds = [...new Set(
    (Array.isArray(snapshot.hiddenKinds) ? snapshot.hiddenKinds : [])
      .map((kind) => String(kind).trim().toLowerCase().slice(0, 128))
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right)).slice(0, 64);
  const hiddenRelationKinds = [...new Set(
    (Array.isArray(snapshot.hiddenRelationKinds) ? snapshot.hiddenRelationKinds : [])
      .map((kind) => String(kind).trim().toLowerCase())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
  const expandedCallCycleIds = [...new Set(
    (Array.isArray(snapshot.expandedCallCycleIds) ? snapshot.expandedCallCycleIds : [])
      .map((id) => String(id).trim().slice(0, 2048))
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right)).slice(0, 256);
  return {
    prefix: snapshot.prefix || '',
    file: snapshot.file ?? null,
    focus: snapshot.focus ?? null,
    callDepth: normalizeCallDepth(snapshot.callDepth),
    callDirection: normalizeCallDirection(snapshot.callDirection),
    layoutId: normalizeLayoutId(mode, snapshot.layoutId),
    selectedId: snapshot.selectedId ?? null,
    hiddenKinds,
    hiddenCodeSets: normalizeCodeSets(snapshot.hiddenCodeSets),
    hiddenRelationKinds,
    expandedCallCycleIds,
    minRelationWeight: Math.min(1_000_000, Math.max(1, Math.floor(Number(snapshot.minRelationWeight) || 1))),
    fileEvidence: normalizeFileEvidence(snapshot.fileEvidence),
    fileDirection: normalizeFileDirection(snapshot.fileDirection),
    minCouplingPercentile: normalizeMinimumCouplingPercentile(snapshot.minCouplingPercentile),
    showExternal: snapshot.showExternal !== false,
    transform: {
      x: Number(snapshot.transform?.x) || 0,
      y: Number(snapshot.transform?.y) || 0,
      k: Number(snapshot.transform?.k) || 1,
    },
  };
}

export function createModeStateStore() {
  const snapshots = new Map();

  return {
    save(mode, snapshot) {
      const key = String(mode);
      snapshots.set(key, cloneSnapshot(snapshot, key));
    },
    restore(mode) {
      const key = String(mode);
      const snapshot = snapshots.get(key);
      return snapshot ? cloneSnapshot(snapshot, key) : null;
    },
  };
}
