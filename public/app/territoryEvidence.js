export function territorySizeEvidence(node) {
  const raw = Number(node?.size);
  if (!Number.isFinite(raw) || raw < 0) return null;
  const count = Math.trunc(raw);
  return {
    count,
    label: `${count.toLocaleString()} indexed ${count === 1 ? 'symbol' : 'symbols'}`,
  };
}
