function endpointId(endpoint) {
  return String(endpoint?.id ?? endpoint);
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
    if (snapshot.size) byScope.set(key, snapshot);
    else byScope.delete(key);
    return get(key);
  }

  function toggle(scope, nodeId) {
    return save(scope, toggleStructureTreeNode(get(scope), nodeId));
  }

  return { get, save, toggle };
}
