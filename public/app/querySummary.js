// public/app/querySummary.js — describe active graph filters and hidden evidence.

import { normalizeCodeSets } from './codeSet.js';
import { normalizeFileDirection } from './fileDirection.js';

function normalizedKinds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function fileDependencyFilterParts(state = {}) {
  const short = [];
  const label = [];
  const selectedId = String(state.selectedId ?? '').trim().replaceAll('\\', '/');
  const direction = normalizeFileDirection(state.fileDirection);
  if (selectedId && direction !== 'both') {
    const name = selectedId.split('/').pop();
    if (direction === 'incoming') {
      short.push(`Incoming to ${name}`);
      label.push(`direct incoming dependencies to ${selectedId}`);
    } else {
      short.push(`Outgoing from ${name}`);
      label.push(`direct outgoing dependencies from ${selectedId}`);
    }
  }
  const evidence = ['all', 'cycles', 'isolated'].includes(state.fileEvidence)
    ? state.fileEvidence
    : 'all';
  if (evidence === 'cycles') {
    short.push('Cycle members');
    label.push('Cycle members');
  } else if (evidence === 'isolated') {
    short.push('Isolated files');
    label.push('Isolated files');
  } else {
    const percentile = Math.min(100, Math.max(0, Math.floor(Number(state.minCouplingPercentile) || 0)));
    if (percentile > 0) {
      short.push(`P${percentile}+ coupling`);
      label.push(`minimum coupling percentile ${percentile}`);
    }
  }

  const weight = Math.min(1_000_000, Math.max(1, Math.floor(Number(state.minRelationWeight) || 1)));
  if (weight > 1) {
    short.push(`weight ≥ ${weight.toLocaleString()}`);
    label.push(`minimum edge weight ${weight.toLocaleString()}`);
  }

  const kinds = normalizedKinds(state.hiddenRelationKinds);
  if (kinds.length) {
    const visible = kinds.slice(0, 2).join(', ');
    short.push(`without ${visible}${kinds.length > 2 ? ` +${kinds.length - 2}` : ''}`);
    label.push(`excluding ${kinds.join(', ')}`);
  }

  return { short, label };
}

export function fileDependencyFilterSummary(state = {}) {
  const { short, label } = fileDependencyFilterParts(state);
  return short.length ? {
    short: short.join(' · '),
    label: `Active filters: ${label.join('; ')}`,
  } : null;
}

export function graphFilterSummary(state = {}) {
  const parts = state.view === 'filedeps'
    ? fileDependencyFilterParts(state)
    : { short: [], label: [] };
  const settings = state.settings && typeof state.settings === 'object' ? state.settings : state;
  const hiddenKinds = normalizedKinds(settings.hiddenKinds);
  if (hiddenKinds.length) {
    const visible = hiddenKinds.slice(0, 2).join(', ');
    parts.short.push(`without kinds: ${visible}${hiddenKinds.length > 2 ? ` +${hiddenKinds.length - 2}` : ''}`);
    parts.label.push(`excluding node kinds ${hiddenKinds.join(', ')}`);
  }
  const hiddenCodeSets = normalizeCodeSets(settings.hiddenCodeSets);
  if (hiddenCodeSets.length) {
    const visible = hiddenCodeSets.slice(0, 2).join(', ');
    parts.short.push(`without sets: ${visible}${hiddenCodeSets.length > 2 ? ` +${hiddenCodeSets.length - 2}` : ''}`);
    parts.label.push(`excluding code sets ${hiddenCodeSets.join(', ')}`);
  }
  if (settings.showExternal === false) {
    parts.short.push('internal only');
    parts.label.push('excluding external nodes');
  }
  return parts.short.length ? {
    short: parts.short.join(' · '),
    label: `Active filters: ${parts.label.join('; ')}`,
  } : null;
}
