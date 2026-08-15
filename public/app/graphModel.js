import { GRAPH_CONSTANTS } from './settings.js';
import { findStronglyConnectedComponents } from './stronglyConnectedComponents.js';
import { CODE_SETS, classifyCodeSet } from './codeSet.js';

export const KIND_COLORS = Object.freeze({
  folder: '#c98cff',
  module: '#c98cff',
  file: '#f5b14c',
  function: '#38e1c6',
  method: '#38e1c6',
  class: '#6aa6ff',
  interface: '#6aa6ff',
  external: '#4a5560',
  unknown: '#6b7682',
});

function colorFor(node) {
  if (node.external) return KIND_COLORS.external;

  const normalizedKind = typeof node.kind === 'string'
    ? node.kind.trim().toLowerCase()
    : '';

  return KIND_COLORS[normalizedKind] ?? KIND_COLORS.unknown;
}

function edgeWeight(value) {
  const numeric = Number(value ?? 1);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 1;
}

function relationBreakdown(relations) {
  if (!Array.isArray(relations)) return [];
  return relations.flatMap((relation) => {
    const kind = typeof relation?.kind === 'string' ? relation.kind.trim() : '';
    if (!kind) return [];
    return [{ kind, weight: edgeWeight(relation.weight) }];
  });
}

function percentile(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return values.length ? Math.round((low / values.length) * 100) : 0;
}

export function couplingLegend(nodes = [], percentiles = [25, 50, 90]) {
  const ordered = nodes
    .map((node) => ({
      value: Number(node?.coupling),
      radius: Number(node?.radius),
    }))
    .filter(({ value, radius }) => Number.isFinite(value) && value >= 0 && Number.isFinite(radius))
    .sort((left, right) => left.value - right.value || left.radius - right.radius);
  if (!ordered.length) return [];

  return percentiles.map((rawPercentile) => {
    const normalized = Math.min(100, Math.max(1, Number(rawPercentile) || 1));
    const index = Math.min(ordered.length - 1, Math.ceil((normalized / 100) * ordered.length) - 1);
    return {
      percentile: normalized,
      value: ordered[index].value,
      radius: ordered[index].radius,
    };
  });
}

export function build(apiData, settings = {}, { view } = {}) {
  const modelSettings = { ...GRAPH_CONSTANTS, ...settings };
  const inputNodes = apiData.nodes ?? [];
  const nodeIds = new Set(inputNodes.map((node) => String(node.id)));
  const links = (apiData.edges ?? [])
    .map((edge) => {
      const relations = relationBreakdown(edge.relations);
      return {
        source: String(edge.source),
        target: String(edge.target),
        weight: edgeWeight(edge.weight),
        ...(edge.kind == null ? {} : { kind: edge.kind }),
        ...(relations.length ? { relations } : {}),
      };
    })
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const degrees = new Map([...nodeIds].map((id) => [id, 0]));
  const weightedInbound = new Map([...nodeIds].map((id) => [id, 0]));
  const weightedOutbound = new Map([...nodeIds].map((id) => [id, 0]));

  for (const link of links) {
    degrees.set(link.source, degrees.get(link.source) + 1);
    degrees.set(link.target, degrees.get(link.target) + 1);
    weightedOutbound.set(link.source, weightedOutbound.get(link.source) + link.weight);
    weightedInbound.set(link.target, weightedInbound.get(link.target) + link.weight);
  }

  const { components, componentByNodeId } = findStronglyConnectedComponents([...nodeIds], links);

  const nodes = inputNodes.map((node) => {
    const id = String(node.id);
    const degree = degrees.get(id);
    const inboundWeight = weightedInbound.get(id);
    const outboundWeight = weightedOutbound.get(id);
    const coupling = inboundWeight + outboundWeight;
    const importance = view === 'filedeps' ? coupling : node.size ?? degree ?? 1;
    const radius = Math.min(
      modelSettings.R_MAX,
      Math.max(
        modelSettings.R_MIN,
        modelSettings.BASE_R + modelSettings.R_SCALE * Math.sqrt(importance),
      ),
    );
    const mass = 1 + modelSettings.MASS_SCALE * Math.sqrt(importance);

    const component = componentByNodeId.get(id);
    return {
      ...node,
      id,
      degree,
      weightedInbound: inboundWeight,
      weightedOutbound: outboundWeight,
      coupling,
      componentId: component.id,
      componentSize: component.members.length,
      inCycle: component.cyclic,
      codeSet: classifyCodeSet(node),
      mass,
      radius,
      color: colorFor(node),
    };
  });

  const couplingValues = nodes.map((node) => node.coupling).sort((left, right) => left - right);
  for (const node of nodes) node.couplingPercentile = percentile(couplingValues, node.coupling);

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const inboundById = new Map(nodes.map((node) => [node.id, []]));
  const outboundById = new Map(nodes.map((node) => [node.id, []]));
  const neighborsById = new Map(nodes.map((node) => [node.id, new Set()]));
  const componentsById = new Map(components.map((component) => [component.id, component]));
  const nodesByCodeSet = new Map(CODE_SETS.map((codeSet) => [codeSet, []]));

  for (const node of nodes) nodesByCodeSet.get(node.codeSet).push(node);

  for (const link of links) {
    outboundById.get(link.source).push(link);
    inboundById.get(link.target).push(link);
    neighborsById.get(link.source).add(link.target);
    neighborsById.get(link.target).add(link.source);
  }

  return {
    nodes,
    links,
    indexes: {
      nodesById,
      inboundById,
      outboundById,
      neighborsById,
      componentsById,
      componentByNodeId,
      nodesByCodeSet,
    },
  };
}
