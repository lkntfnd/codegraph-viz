import { fileGroupForNode } from './fileGroups.js';

const endpointId = (endpoint) => String(
  typeof endpoint === 'object' && endpoint !== null ? endpoint.id : endpoint,
);

const nodeLabel = (node) => String(node?.label ?? node?.id ?? '');

function cycleSortLabels(model) {
  const labels = new Map();
  for (const component of model.indexes.componentsById.values()) {
    if (!component.cyclic) continue;
    let representative = null;
    for (const id of component.members) {
      const label = nodeLabel(model.indexes.nodesById.get(id));
      if (representative == null || label.localeCompare(representative) < 0) representative = label;
    }
    for (const id of component.members) labels.set(String(id), representative ?? String(id));
  }
  return labels;
}

function orderedNodes(model) {
  const cycleLabels = cycleSortLabels(model);
  return [...model.nodes].sort((left, right) => (
    fileGroupForNode(left).localeCompare(fileGroupForNode(right))
    || Number(Boolean(right.inCycle)) - Number(Boolean(left.inCycle))
    || String(cycleLabels.get(String(left.id)) ?? nodeLabel(left))
      .localeCompare(String(cycleLabels.get(String(right.id)) ?? nodeLabel(right)))
    || nodeLabel(left).localeCompare(nodeLabel(right))
    || String(left.id).localeCompare(String(right.id))
  ));
}

function folderRanges(nodes) {
  const groups = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const id = fileGroupForNode(nodes[index]);
    const current = groups.at(-1);
    if (current?.id === id) {
      current.end = index + 1;
      current.count += 1;
    } else {
      groups.push({ id, start: index, end: index + 1, count: 1 });
    }
  }
  return groups;
}

function cycleRanges(model, indexById) {
  return [...model.indexes.componentsById.values()]
    .filter((component) => component.cyclic)
    .map((component) => ({
      id: component.id,
      indexes: component.members
        .map((id) => indexById.get(id))
        .filter(Number.isInteger)
        .sort((left, right) => left - right),
      members: [...component.members],
    }))
    .filter((component) => component.indexes.length)
    .sort((left, right) => left.indexes[0] - right.indexes[0] || left.id.localeCompare(right.id));
}

function matrixCells(model, indexById) {
  const cells = new Map();
  for (const link of model.links) {
    const sourceId = endpointId(link.source);
    const targetId = endpointId(link.target);
    const sourceIndex = indexById.get(sourceId);
    const targetIndex = indexById.get(targetId);
    if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) continue;
    const key = `${sourceId}\u0000${targetId}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        sourceId,
        targetId,
        sourceIndex,
        targetIndex,
        weight: 0,
        kinds: new Set(),
        relationWeights: new Map(),
      };
      cells.set(key, cell);
    }
    const weight = Number(link.weight);
    cell.weight += Number.isFinite(weight) && weight >= 0 ? weight : 1;
    const relations = Array.isArray(link.relations) && link.relations.length
      ? link.relations
      : link.kind == null ? [] : [{ kind: link.kind, weight: link.weight }];
    for (const relation of relations) {
      const kind = String(relation.kind).trim();
      if (!kind) continue;
      const relationWeight = Number(relation.weight);
      const normalizedWeight = Number.isFinite(relationWeight) && relationWeight >= 0
        ? relationWeight
        : 1;
      cell.kinds.add(kind);
      cell.relationWeights.set(kind, (cell.relationWeights.get(kind) || 0) + normalizedWeight);
    }
  }

  return [...cells.values()]
    .map(({ relationWeights, ...cell }) => ({
      ...cell,
      kinds: [...cell.kinds].sort((left, right) => left.localeCompare(right)),
      relations: [...relationWeights]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([kind, weight]) => ({ kind, weight })),
    }))
    .sort((left, right) => left.sourceIndex - right.sourceIndex || left.targetIndex - right.targetIndex);
}

export function buildDependencyMatrix(model) {
  if (!model?.indexes?.nodesById || !model?.indexes?.componentsById) {
    throw new TypeError('Dependency Matrix requires an indexed graph model');
  }
  const nodes = orderedNodes(model);
  const indexById = new Map(nodes.map((node, index) => [String(node.id), index]));
  const cells = matrixCells(model, indexById);

  return {
    nodes,
    indexById,
    folderGroups: folderRanges(nodes),
    cycleGroups: cycleRanges(model, indexById),
    cells,
    maxWeight: cells.reduce((maximum, cell) => Math.max(maximum, cell.weight), 0),
  };
}

export function matrixPositionAt(matrix, x, y) {
  const pointX = Number(x);
  const pointY = Number(y);
  const { originX, originY, dimension, cellSize, nodes, cellByCoordinate } = matrix ?? {};
  if (![pointX, pointY, originX, originY, dimension, cellSize].every(Number.isFinite)
    || !(dimension > 0)
    || !(cellSize > 0)
    || !Array.isArray(nodes)
    || !(cellByCoordinate instanceof Map)) return null;
  if (pointX < originX || pointX >= originX + dimension
    || pointY < originY || pointY >= originY + dimension) return null;

  const targetIndex = Math.floor((pointX - originX) / cellSize);
  const sourceIndex = Math.floor((pointY - originY) / cellSize);
  const source = nodes[sourceIndex];
  const target = nodes[targetIndex];
  if (!source || !target) return null;

  return {
    sourceIndex,
    targetIndex,
    sourceId: String(source.id),
    targetId: String(target.id),
    source,
    target,
    cell: cellByCoordinate.get(`${sourceIndex}:${targetIndex}`) ?? null,
  };
}

export function describeMatrixPosition(position) {
  if (!position?.source || !position?.target) return null;
  const path = (node) => (node.path == null && node.file == null ? null : String(node.path ?? node.file));
  return {
    sourceId: String(position.source.id),
    sourceLabel: nodeLabel(position.source),
    sourcePath: path(position.source),
    targetId: String(position.target.id),
    targetLabel: nodeLabel(position.target),
    targetPath: path(position.target),
    weight: Number(position.cell?.weight ?? 0),
    kinds: [...(position.cell?.kinds ?? [])],
    relations: (position.cell?.relations ?? []).map((relation) => ({ ...relation })),
    hasDependency: Boolean(position.cell),
  };
}

export function matrixEntityFocus(matrix, nodeId, options = {}) {
  const id = String(nodeId);
  const index = matrix?.indexById?.get(id);
  const node = Number.isInteger(index) ? matrix?.nodes?.[index] : null;
  const cellSize = Number(matrix?.cellSize);
  if (!node || !(cellSize > 0)) return null;
  const currentScale = Number(options.currentScale);
  const minimumCellPixels = Number(options.minimumCellPixels);
  const retainedScale = Number.isFinite(currentScale) && currentScale > 0 ? currentScale : 1;
  const targetPixels = Number.isFinite(minimumCellPixels) && minimumCellPixels > 0
    ? minimumCellPixels
    : 6;
  return {
    node,
    position: { sourceIndex: index, targetIndex: index },
    scale: Math.max(retainedScale, targetPixels / cellSize),
  };
}

export function formatRelationBreakdown(relations) {
  if (!Array.isArray(relations) || !relations.length) return 'Aggregated relation';
  return relations
    .map(({ kind, weight }) => `${kind} × ${Number(weight).toLocaleString()}`)
    .join(' · ');
}
