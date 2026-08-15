// public/app/relationFilter.js — filter relation kinds and recompute visible weights.

function relationId(kind) {
  return String(kind ?? '').trim().toLowerCase();
}

function relationWeight(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 1;
}

function edgeRelations(edge) {
  if (Array.isArray(edge?.relations) && edge.relations.length) {
    return edge.relations.flatMap((relation) => {
      const label = String(relation?.kind ?? '').trim();
      return label ? [{ id: relationId(label), label, weight: relationWeight(relation.weight) }] : [];
    });
  }
  const label = String(edge?.kind ?? '').trim();
  return label ? [{ id: relationId(label), label, weight: relationWeight(edge.weight) }] : [];
}

export function relationKindSummary(edges = []) {
  const summary = new Map();
  for (const edge of edges) {
    for (const relation of edgeRelations(edge)) {
      const current = summary.get(relation.id);
      if (current) current.weight += relation.weight;
      else summary.set(relation.id, { ...relation });
    }
  }
  return [...summary.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, label, weight }) => ({ id, label, weight }));
}

export function filterEdgesByRelations(edges = [], hiddenKinds = []) {
  const hidden = new Set(hiddenKinds.map(relationId).filter(Boolean));
  return edges.flatMap((edge) => {
    const relations = edgeRelations(edge);
    if (!relations.length) return [{ ...edge }];
    if (!Array.isArray(edge.relations) || !edge.relations.length) {
      return hidden.has(relations[0].id) ? [] : [{ ...edge }];
    }
    const visible = relations.filter((relation) => !hidden.has(relation.id));
    if (!visible.length) return [];
    return [{
      ...edge,
      weight: visible.reduce((total, relation) => total + relation.weight, 0),
      relations: visible.map(({ label: kind, weight }) => ({ kind, weight })),
    }];
  });
}

export function filterEdgesByMinimumWeight(edges = [], minimumWeight = 1) {
  const numeric = Number(minimumWeight);
  const minimum = Number.isFinite(numeric) ? Math.max(1, Math.floor(numeric)) : 1;
  return edges.filter((edge) => relationWeight(edge?.weight) >= minimum);
}
