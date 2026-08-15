// public/app/inspector.js — derive selected-node and change-impact evidence.

const endpointId = (endpoint) => String(
  typeof endpoint === 'object' && endpoint !== null ? endpoint.id : endpoint,
);

function describeRelation(model, link, direction) {
  const nodeId = endpointId(direction === 'inbound' ? link.source : link.target);
  const node = model.indexes.nodesById.get(nodeId);

  return {
    nodeId,
    label: String(node?.label ?? nodeId),
    kind: String(node?.kind ?? 'unknown'),
    relation: link.kind == null ? null : String(link.kind),
    weight: Number(link.weight ?? 1),
  };
}

function collectReach(model, selectedId, direction) {
  const adjacency = direction === 'callers'
    ? model.indexes.inboundById
    : model.indexes.outboundById;
  const endpoint = direction === 'callers' ? 'source' : 'target';
  const visited = new Set([selectedId]);
  const directIds = new Set();
  const queue = [];

  for (const link of adjacency.get(selectedId) || []) {
    const id = endpointId(link[endpoint]);
    if (id === selectedId || visited.has(id)) continue;
    visited.add(id);
    directIds.add(id);
    queue.push(id);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const link of adjacency.get(current) || []) {
      const id = endpointId(link[endpoint]);
      if (id === selectedId || visited.has(id)) continue;
      visited.add(id);
      queue.push(id);
    }
  }

  visited.delete(selectedId);
  const files = [...new Set([...visited]
    .map((id) => model.indexes.nodesById.get(id))
    .map((node) => node?.file ?? node?.path)
    .filter((file) => file !== undefined && file !== null && String(file).trim())
    .map(String))]
    .sort((left, right) => left.localeCompare(right));
  return {
    direct: directIds.size,
    transitive: Math.max(0, visited.size - directIds.size),
    total: visited.size,
    files,
    fileCount: files.length,
  };
}

export function cycleEvidenceCopy(view, size) {
  const count = Math.max(0, Math.trunc(Number(size) || 0));
  if (view === 'callgraph') {
    return {
      title: 'Loaded call cycle',
      description: `${count} ${count === 1 ? 'symbol' : 'symbols'} in one strongly connected group`,
      caveat: 'Loaded trace only. Membership does not prove runtime recursion.',
      ariaLabel: 'Loaded call cycle evidence',
    };
  }
  return {
    title: 'Dependency cycle',
    description: `${count} ${count === 1 ? 'file' : 'files'} in one strongly connected group`,
    caveat: 'Loaded scope only. Membership indicates mutual reachability.',
    ariaLabel: 'Dependency cycle evidence',
  };
}

export function describeImpactReach(model, selectedId) {
  if (selectedId == null || !model?.indexes) return null;
  const id = String(selectedId);
  if (!model.indexes.nodesById.has(id)) return null;
  return {
    callers: collectReach(model, id, 'callers'),
    callees: collectReach(model, id, 'callees'),
  };
}

export function describeSelection(model, selectedId) {
  if (selectedId == null || !model?.indexes) return null;
  const id = String(selectedId);
  const node = model.indexes.nodesById.get(id);
  if (!node) return null;
  const component = model.indexes.componentByNodeId?.get(id);
  const inboundLinks = model.indexes.inboundById.get(id) || [];
  const outboundLinks = model.indexes.outboundById.get(id) || [];
  const hasHierarchy = Object.prototype.hasOwnProperty.call(node, 'parent');
  const childNodes = hasHierarchy
    ? outboundLinks
      .filter((link) => String(link.kind || '') === 'contains')
      .map((link) => model.indexes.nodesById.get(endpointId(link.target)))
      .filter(Boolean)
    : [];
  const parentId = hasHierarchy && node.parent != null ? String(node.parent) : null;
  const hierarchy = hasHierarchy ? {
    depth: Number(node.treeDepth ?? 0),
    parentId,
    parentLabel: parentId == null
      ? null
      : String(model.indexes.nodesById.get(parentId)?.label ?? parentId),
    directChildren: childNodes.length,
    folderChildren: childNodes.filter((child) => String(child.kind).toLowerCase() === 'folder').length,
    fileChildren: childNodes.filter((child) => String(child.kind).toLowerCase() === 'file').length,
    symbolCount: Number(node.size ?? 0),
  } : null;
  const rawPath = node.path == null && node.file == null ? null : String(node.path ?? node.file);

  return {
    id,
    label: String(node.label ?? id),
    kind: String(node.kind ?? 'unknown'),
    path: hierarchy && rawPath === '' ? '.' : rawPath,
    external: Boolean(node.external),
    coupling: {
      weightedInbound: Number(node.weightedInbound ?? 0),
      weightedOutbound: Number(node.weightedOutbound ?? 0),
      total: Number(node.coupling ?? 0),
      percentile: Number(node.couplingPercentile ?? 0),
    },
    cycle: component?.cyclic ? {
      componentId: component.id,
      size: component.members.length,
      members: component.members.map((nodeId) => ({
        nodeId,
        label: String(model.indexes.nodesById.get(nodeId)?.label ?? nodeId),
      })),
    } : null,
    ...(hierarchy ? { hierarchy } : {}),
    inbound: inboundLinks
      .map((link) => describeRelation(model, link, 'inbound')),
    outbound: outboundLinks
      .map((link) => describeRelation(model, link, 'outbound')),
  };
}

export function describeCallCycleSummary(presentationModel, fullModel, selectedId) {
  const id = selectedId == null ? null : String(selectedId);
  const node = id == null ? null : presentationModel?.indexes?.nodesById.get(id);
  if (!node?.cycleSummary) return null;
  const details = describeSelection(presentationModel, id);
  const componentId = String(node.loadedComponentId ?? node.componentId);
  const component = fullModel?.indexes?.componentsById.get(componentId);
  const members = component?.members || [
    ...(node.memberIds || []),
    ...(node.retainedMemberIds || []),
  ].map(String).sort((left, right) => left.localeCompare(right));
  const loadedCount = component?.members.length || Number(node.loadedComponentSize) || members.length;
  const hiddenCount = Array.isArray(node.memberIds) ? node.memberIds.length : Number(node.size) || 0;

  return {
    ...details,
    label: `${hiddenCount.toLocaleString('en-US')} loaded cycle members`,
    kind: 'Loaded cycle summary',
    path: null,
    summary: {
      componentId,
      hiddenCount,
      loadedCount,
      retainedCount: Math.max(0, loadedCount - hiddenCount),
    },
    cycle: {
      componentId,
      size: loadedCount,
      members: members.map((nodeId) => ({
        nodeId,
        label: String(fullModel?.indexes?.nodesById.get(nodeId)?.label ?? nodeId),
      })),
    },
  };
}
