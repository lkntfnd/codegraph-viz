// public/app/entityBrowser.js — rank and search entities in the loaded graph.

function text(value) {
  return String(value ?? '').trim();
}

function matchRank(node, query) {
  if (!query) return 0;
  const id = text(node.id).toLowerCase();
  const label = text(node.label || node.id).toLowerCase();
  const path = text(node.path || node.file).toLowerCase();
  const kind = text(node.kind || 'unknown').toLowerCase();
  if (label === query || id === query || path === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  if (path.includes(query) || id.includes(query)) return 3;
  if (kind.includes(query)) return 4;
  return null;
}

function evidence(node) {
  const coupling = Number(node.coupling);
  const degree = Number(node.degree);
  return Number.isFinite(coupling) ? coupling : Number.isFinite(degree) ? degree : 0;
}

export function browseGraphEntities(model = {}, query = '', { limit = 100 } = {}) {
  const normalizedQuery = text(query).toLowerCase().slice(0, 256);
  const budget = Math.min(100, Math.max(1, Math.floor(Number(limit) || 100)));
  const nodes = Array.isArray(model.nodes) ? model.nodes : [];
  const matches = nodes.flatMap((node) => {
    const rank = matchRank(node, normalizedQuery);
    return rank == null ? [] : [{ node, rank }];
  }).sort((left, right) => left.rank - right.rank
    || evidence(right.node) - evidence(left.node)
    || text(left.node.label || left.node.id).localeCompare(text(right.node.label || right.node.id))
    || text(left.node.id).localeCompare(text(right.node.id)));
  const items = matches.slice(0, budget).map(({ node }) => {
    const id = text(node.id);
    return {
      id,
      label: text(node.label || id),
      kind: text(node.kind || 'unknown'),
      path: text(node.path || node.file),
      inbound: model.indexes?.inboundById?.get(id)?.length ?? 0,
      outbound: model.indexes?.outboundById?.get(id)?.length ?? 0,
    };
  });
  return {
    items,
    total: matches.length,
    limited: matches.length > items.length,
  };
}
