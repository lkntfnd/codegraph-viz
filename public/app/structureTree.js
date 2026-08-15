// public/app/structureTree.js — project collapsed containment hierarchies safely.

function endpointId(endpoint) {
  return String(endpoint?.id ?? endpoint);
}

function structureChildren(model) {
  const nodesById = new Map((model?.nodes || []).map((node) => [String(node.id), node]));
  const childrenById = new Map([...nodesById.keys()].map((id) => [id, []]));
  for (const node of nodesById.values()) {
    const id = String(node.id);
    const parentId = node.parent == null ? null : String(node.parent);
    if (parentId !== null && childrenById.has(parentId)) childrenById.get(parentId).push(id);
  }
  for (const children of childrenById.values()) children.sort((left, right) => left.localeCompare(right));
  return { nodesById, childrenById };
}

export function defaultStructureCollapseIds(model, options = {}) {
  const limit = Math.max(2, Math.trunc(Number(options.limit) || 36));
  const { nodesById, childrenById } = structureChildren(model);
  if (nodesById.size <= limit) return new Set();

  const roots = new Set([...nodesById.values()]
    .filter((node) => node.parent == null || !nodesById.has(String(node.parent)))
    .map((node) => String(node.id)));
  const hidden = new Set();
  const collapsed = new Set();

  function visibleDescendants(id, seen = new Set()) {
    if (seen.has(id)) return [];
    seen.add(id);
    const descendants = [];
    for (const childId of childrenById.get(id) || []) {
      if (!hidden.has(childId)) descendants.push(childId);
      descendants.push(...visibleDescendants(childId, seen));
    }
    return descendants;
  }

  while (nodesById.size - hidden.size > limit) {
    const candidates = [...childrenById]
      .filter(([id, children]) => children.length && !hidden.has(id) && !collapsed.has(id))
      .map(([id]) => ({ id, descendants: visibleDescendants(id) }))
      .filter((candidate) => candidate.descendants.length)
      .sort((left, right) => (
        Number(roots.has(left.id)) - Number(roots.has(right.id))
        || right.descendants.length - left.descendants.length
        || left.id.localeCompare(right.id)
      ));
    const candidate = candidates[0];
    if (!candidate) break;
    collapsed.add(candidate.id);
    for (const id of candidate.descendants) hidden.add(id);
  }
  return collapsed;
}

export function projectStructureTreeModel(model, visibleNodeIds) {
  if (!model || !(visibleNodeIds instanceof Set)) return model;
  const nodes = model.nodes.filter((node) => visibleNodeIds.has(String(node.id)));
  const links = model.links.filter((link) => (
    visibleNodeIds.has(endpointId(link.source))
    && visibleNodeIds.has(endpointId(link.target))
  ));
  return { ...model, nodes, links };
}

export function toggleStructureTreeNode(collapsedIds, nodeId) {
  const next = new Set(collapsedIds || []);
  const id = String(nodeId);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function scopeKey(scope) {
  return String(scope ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\/+|\/+$/g, '');
}

export function createStructureCollapseStore() {
  const byScope = new Map();

  function get(scope) {
    return new Set(byScope.get(scopeKey(scope)) || []);
  }

  function save(scope, collapsedIds) {
    const key = scopeKey(scope);
    const snapshot = new Set(
      [...(collapsedIds || [])].map((id) => String(id)).filter(Boolean),
    );
    byScope.set(key, snapshot);
    return get(key);
  }

  function toggle(scope, nodeId) {
    return save(scope, toggleStructureTreeNode(get(scope), nodeId));
  }

  return {
    get,
    has(scope) {
      return byScope.has(scopeKey(scope));
    },
    save,
    toggle,
  };
}
