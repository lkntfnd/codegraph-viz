// public/app/fileEvidence.js — derive coupling, cycle, and isolation evidence.

import { findStronglyConnectedComponents } from './stronglyConnectedComponents.js';

const FILE_EVIDENCE = new Set(['all', 'cycles', 'isolated']);

function endpointId(endpoint) {
  return String(endpoint?.id ?? endpoint ?? '');
}

export function normalizeFileEvidence(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return FILE_EVIDENCE.has(normalized) ? normalized : 'all';
}

export function normalizeMinimumCouplingPercentile(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, Math.floor(numeric))) : 0;
}

function couplingLandscape(data, minimumPercentile) {
  const minimum = normalizeMinimumCouplingPercentile(minimumPercentile);
  if (minimum === 0) return data;
  const coupling = new Map(data.nodes.map((node) => [String(node.id), 0]));
  for (const edge of data.edges) {
    const source = endpointId(edge.source);
    const target = endpointId(edge.target);
    if (!coupling.has(source) || !coupling.has(target)) continue;
    const numeric = Number(edge.weight);
    const weight = Number.isFinite(numeric) && numeric >= 0 ? numeric : 1;
    coupling.set(source, coupling.get(source) + weight);
    coupling.set(target, coupling.get(target) + weight);
  }
  const ordered = [...coupling.values()].sort((left, right) => left - right);
  const percentile = (target) => {
    let low = 0;
    let high = ordered.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ordered[middle] <= target) low = middle + 1;
      else high = middle;
    }
    return ordered.length ? Math.round((low / ordered.length) * 100) : 0;
  };
  const kept = new Set([...coupling]
    .filter(([, value]) => percentile(value) >= minimum)
    .map(([id]) => id));
  return {
    ...data,
    nodes: data.nodes.filter((node) => kept.has(String(node.id))),
    edges: data.edges.filter((edge) => kept.has(endpointId(edge.source)) && kept.has(endpointId(edge.target))),
  };
}

export function filterFileDependencyEvidence(data = {}, evidence = 'all', options = {}) {
  const nodes = Array.isArray(data.nodes) ? data.nodes.map((node) => ({ ...node })) : [];
  const edges = Array.isArray(data.edges) ? data.edges.map((edge) => ({ ...edge })) : [];
  const normalized = normalizeFileEvidence(evidence);
  if (normalized === 'all') {
    return couplingLandscape(
      { ...data, nodes, edges },
      options.minimumCouplingPercentile,
    );
  }

  const nodeIds = new Set(nodes.map((node) => String(node.id)));
  if (normalized === 'cycles') {
    const { components } = findStronglyConnectedComponents([...nodeIds], edges);
    const cyclicIds = new Set(components
      .filter((component) => component.cyclic)
      .flatMap((component) => component.members));
    return {
      ...data,
      nodes: nodes.filter((node) => cyclicIds.has(String(node.id))),
      edges: edges.filter((edge) => (
        cyclicIds.has(endpointId(edge.source)) && cyclicIds.has(endpointId(edge.target))
      )),
    };
  }

  const connected = new Set();
  for (const edge of edges) {
    const source = endpointId(edge.source);
    const target = endpointId(edge.target);
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    connected.add(source);
    connected.add(target);
  }
  return {
    ...data,
    nodes: nodes.filter((node) => !connected.has(String(node.id))),
    edges: [],
  };
}
