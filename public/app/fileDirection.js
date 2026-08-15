// public/app/fileDirection.js — filter direct dependencies by selected-file direction.

const DIRECTIONS = new Set(['incoming', 'outgoing', 'both']);

function endpointId(endpoint) {
  return String(typeof endpoint === 'object' && endpoint !== null ? endpoint.id : endpoint);
}

export function normalizeFileDirection(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return DIRECTIONS.has(normalized) ? normalized : 'both';
}

export function filterSelectedFileDirection(data, selectedId, direction = 'both') {
  if (!data || typeof data !== 'object') return { nodes: [], edges: [] };
  const normalized = normalizeFileDirection(direction);
  if (normalized === 'both') return data;

  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const selected = String(selectedId ?? '');
  if (!selected || !nodes.some((node) => String(node?.id) === selected)) return data;

  const matchingEdges = edges.filter((edge) => (
    normalized === 'incoming'
      ? endpointId(edge?.target) === selected
      : endpointId(edge?.source) === selected
  ));
  const visibleIds = new Set([selected]);
  for (const edge of matchingEdges) {
    visibleIds.add(endpointId(edge.source));
    visibleIds.add(endpointId(edge.target));
  }
  return {
    ...data,
    nodes: nodes.filter((node) => visibleIds.has(String(node?.id))),
    edges: matchingEdges,
  };
}
