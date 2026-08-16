// public/app/callPath.js — trace loaded caller and callee paths around a focus.

const endpointId = (endpoint) => String(
  typeof endpoint === 'object' && endpoint !== null ? endpoint.id : endpoint,
);

export function callLinkKey(source, target) {
  return `${endpointId(source)}\u0000${endpointId(target)}`;
}

function directedPath(links, startId, endId, direction) {
  const adjacency = new Map();
  for (const link of links || []) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (!adjacency.has(source)) adjacency.set(source, []);
    adjacency.get(source).push({ target, key: callLinkKey(source, target) });
  }
  for (const targets of adjacency.values()) {
    targets.sort((left, right) => left.target.localeCompare(right.target) || left.key.localeCompare(right.key));
  }

  const queue = [startId];
  const parent = new Map([[startId, null]]);
  for (let cursor = 0; cursor < queue.length && !parent.has(endId); cursor += 1) {
    const current = queue[cursor];
    for (const edge of adjacency.get(current) || []) {
      if (parent.has(edge.target)) continue;
      parent.set(edge.target, { nodeId: current, linkKey: edge.key });
      queue.push(edge.target);
    }
  }
  if (!parent.has(endId)) return null;

  const nodeIds = [];
  const linkKeys = [];
  for (let current = endId; current != null;) {
    nodeIds.push(current);
    const step = parent.get(current);
    if (!step) break;
    linkKeys.push(step.linkKey);
    current = step.nodeId;
  }
  nodeIds.reverse();
  linkKeys.reverse();
  return { direction, nodeIds, linkKeys };
}

export function findLoadedCallPath(model, selectedId) {
  const nodes = model?.nodes || [];
  const links = model?.links || [];
  const selected = nodes.find((node) => endpointId(node.id) === String(selectedId));
  const focus = nodes.find((node) => node.focus || node.relationRole === 'focus');
  if (!selected || !focus) return null;

  const selectedKey = endpointId(selected.id);
  const focusKey = endpointId(focus.id);
  if (selectedKey === focusKey) return null;

  if (selected.relationRole === 'inbound') {
    return directedPath(links, selectedKey, focusKey, 'inbound');
  }
  if (selected.relationRole === 'outbound') {
    return directedPath(links, focusKey, selectedKey, 'outbound');
  }

  const candidates = [
    directedPath(links, focusKey, selectedKey, 'outbound'),
    directedPath(links, selectedKey, focusKey, 'inbound'),
  ].filter(Boolean);
  return candidates.sort((left, right) => (
    left.linkKeys.length - right.linkKeys.length
    || Number(right.direction === 'outbound') - Number(left.direction === 'outbound')
    || left.nodeIds.join('\u0000').localeCompare(right.nodeIds.join('\u0000'))
  ))[0] || null;
}
