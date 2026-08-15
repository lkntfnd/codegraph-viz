const DIRECTION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

function finiteNodes(nodes = []) {
  return nodes.filter((node) => (
    node?.id !== undefined
    && node?.id !== null
    && Number.isFinite(Number(node.x))
    && Number.isFinite(Number(node.y))
  ));
}

function initialNode(nodes) {
  const focus = nodes
    .filter((node) => node.focus)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
  if (focus) return focus;
  return [...nodes].sort((left, right) => (
    Math.hypot(Number(left.x), Number(left.y)) - Math.hypot(Number(right.x), Number(right.y))
    || String(left.id).localeCompare(String(right.id))
  ))[0];
}

function components(dx, dy, key) {
  if (key === 'ArrowRight') return { primary: dx, secondary: Math.abs(dy) };
  if (key === 'ArrowLeft') return { primary: -dx, secondary: Math.abs(dy) };
  if (key === 'ArrowDown') return { primary: dy, secondary: Math.abs(dx) };
  return { primary: -dy, secondary: Math.abs(dx) };
}

export function directionalNodeId(nodes = [], currentId, key) {
  if (!DIRECTION_KEYS.has(key)) return null;
  const positioned = finiteNodes(nodes);
  if (!positioned.length) return null;
  const current = positioned.find((node) => String(node.id) === String(currentId));
  if (!current) return String(initialNode(positioned).id);

  const candidates = [];
  for (const node of positioned) {
    if (node === current) continue;
    const dx = Number(node.x) - Number(current.x);
    const dy = Number(node.y) - Number(current.y);
    const { primary, secondary } = components(dx, dy, key);
    if (primary <= 0) continue;
    candidates.push({
      id: String(node.id),
      score: (secondary / primary) * 1_000 + Math.hypot(dx, dy),
    });
  }
  candidates.sort((left, right) => left.score - right.score || left.id.localeCompare(right.id));
  return candidates[0]?.id ?? String(current.id);
}
