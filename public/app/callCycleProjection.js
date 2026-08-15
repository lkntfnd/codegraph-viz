// public/app/callCycleProjection.js — compact large call cycles without losing evidence.

import { build as buildGraphModel } from './graphModel.js';

export const CALL_CYCLE_SUMMARY_THRESHOLD = 80;

const endpointId = (endpoint) => String(
  typeof endpoint === 'object' && endpoint !== null ? endpoint.id : endpoint,
);

function stableNodes(nodes) {
  return [...nodes].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function stableEdges(edges) {
  return [...edges].sort((left, right) => (
    String(left.source).localeCompare(String(right.source))
    || String(left.target).localeCompare(String(right.target))
    || String(left.kind ?? '').localeCompare(String(right.kind ?? ''))
  ));
}

function relationCounts(link) {
  const entries = link?.relations && typeof link.relations === 'object'
    ? Object.entries(link.relations)
    : [];
  if (entries.length) {
    return entries
      .map(([kind, count]) => [String(kind), Number(count)])
      .filter(([kind, count]) => kind && Number.isFinite(count) && count > 0);
  }
  const kind = String(link?.kind ?? '').trim();
  const weight = Number(link?.weight);
  return kind ? [[kind, Number.isFinite(weight) && weight > 0 ? weight : 1]] : [];
}

function summaryIdFor(componentId, occupiedIds) {
  let id = `~call-cycle:${componentId}`;
  while (occupiedIds.has(id)) id += ':';
  occupiedIds.add(id);
  return id;
}

export function projectLargeCallCycles(model, options = {}) {
  const nodes = Array.isArray(model?.nodes) ? model.nodes : [];
  const links = Array.isArray(model?.links) ? model.links : [];
  const components = model?.indexes?.componentsById instanceof Map
    ? [...model.indexes.componentsById.values()]
    : [];
  const threshold = Math.max(
    2,
    Math.floor(Number(options.threshold) || CALL_CYCLE_SUMMARY_THRESHOLD),
  );
  const retainedIds = new Set(
    [options.focusId, options.selectedId]
      .filter((id) => id != null)
      .map(String),
  );
  const expandedIds = new Set([...(options.expandedComponentIds || [])].map(String));
  const occupiedIds = new Set(nodes.map((node) => String(node.id)));
  const replacementById = new Map();
  const summaries = [];
  const collapsedComponents = [];

  for (const component of [...components].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!component.cyclic || component.members.length <= threshold || expandedIds.has(component.id)) continue;
    const members = [...component.members].map(String).sort((left, right) => left.localeCompare(right));
    const retainedMemberIds = members.filter((id) => retainedIds.has(id));
    const hiddenMemberIds = members.filter((id) => !retainedIds.has(id));
    if (!hiddenMemberIds.length) continue;

    const summaryId = summaryIdFor(component.id, occupiedIds);
    for (const id of hiddenMemberIds) replacementById.set(id, summaryId);
    summaries.push({
      id: summaryId,
      label: `Cycle ×${hiddenMemberIds.length.toLocaleString('en-US')}`,
      kind: 'cycle',
      cycleSummary: true,
      componentId: component.id,
      loadedComponentId: component.id,
      componentSize: members.length,
      loadedComponentSize: members.length,
      memberIds: hiddenMemberIds,
      retainedMemberIds,
      inCycle: true,
      size: hiddenMemberIds.length,
    });
    collapsedComponents.push({
      id: component.id,
      summaryId,
      members,
      hiddenMemberIds,
      retainedMemberIds,
    });
  }

  const projectedNodes = [
    ...stableNodes(nodes
      .filter((node) => !replacementById.has(String(node.id)))
      .map((node) => ({ ...node }))),
    ...stableNodes(summaries),
  ];
  const passthrough = [];
  const aggregates = new Map();

  for (const link of links) {
    const originalSource = endpointId(link.source);
    const originalTarget = endpointId(link.target);
    const source = replacementById.get(originalSource) ?? originalSource;
    const target = replacementById.get(originalTarget) ?? originalTarget;
    if (source === target) continue;
    const projected = source !== originalSource || target !== originalTarget;
    if (!projected) {
      passthrough.push({ ...link, source, target });
      continue;
    }

    const key = `${source}\u0000${target}`;
    if (!aggregates.has(key)) {
      aggregates.set(key, { source, target, weight: 0, relations: {} });
    }
    const aggregate = aggregates.get(key);
    const weight = Number(link.weight);
    aggregate.weight += Number.isFinite(weight) && weight > 0 ? weight : 1;
    for (const [kind, count] of relationCounts(link)) {
      aggregate.relations[kind] = (aggregate.relations[kind] || 0) + count;
    }
  }

  const projectedEdges = stableEdges([
    ...passthrough,
    ...[...aggregates.values()].map((edge) => ({
      ...edge,
      relations: Object.fromEntries(
        Object.entries(edge.relations).sort(([left], [right]) => left.localeCompare(right)),
      ),
    })),
  ]);

  return {
    nodes: projectedNodes,
    edges: projectedEdges,
    collapsedComponents,
  };
}

export function buildCallCyclePresentation(model, options = {}) {
  const projection = projectLargeCallCycles(model, options);
  if (!projection.collapsedComponents.length) {
    return { fullModel: model, model, collapsedComponents: [] };
  }
  return {
    fullModel: model,
    model: buildGraphModel(
      { nodes: projection.nodes, edges: projection.edges },
      undefined,
      { view: 'callgraph' },
    ),
    collapsedComponents: projection.collapsedComponents,
  };
}
