import { apply as applyForces, build as buildForces } from './forces.js';
import { buildDependencyMatrix } from './dependencyMatrix.js';
import { fileGroupForNode } from './fileGroups.js';

const MOTION_ALPHA_TARGET = 0.015;
const MOTION_ALPHA_FLOOR = 0.04;
const IMPACT_LANE_GAP = 240;
const IMPACT_ROW_GAP = 74;
const IMPACT_DENSE_LANE_THRESHOLD = 24;
const IMPACT_BAND_MIN_COLUMNS = 5;
const IMPACT_BAND_MAX_COLUMNS = 20;
const IMPACT_BAND_MIN_COLUMN_GAP = 42;
const IMPACT_BAND_MIN_ROW_GAP = 48;
const RADIAL_RING_GAP = 180;
const RADIAL_NODE_GAP = 18;
const TERRITORY_WIDTH = 1200;
const TERRITORY_HEIGHT = 800;
const TERRITORY_GAP = 8;
const HOTSPOT_COLUMN_GAP = 360;
const HOTSPOT_ROW_GAP = 260;
const HOTSPOT_CLUSTER_STRENGTH = 0.08;
const HOTSPOT_GRID_GAP = 18;
const HOTSPOT_GROUP_GAP = 80;
const HOTSPOT_MAX_PHYSICS_NODES = 600;
const HOTSPOT_MAX_PHYSICS_LINKS = 1_800;
const MATRIX_MIN_CELL_SIZE = 7;
const MATRIX_MAX_CELL_SIZE = 26;
const MATRIX_TARGET_SIZE = 640;

const endpointId = (endpoint) => String(
  typeof endpoint === 'object' && endpoint !== null ? endpoint.id : endpoint,
);

function directedDepths(indexes, focusId, direction) {
  const depths = new Map([[focusId, 0]]);
  const queue = [focusId];
  const relations = direction === 'inbound' ? indexes.inboundById : indexes.outboundById;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    for (const link of relations.get(id) || []) {
      const neighborId = endpointId(direction === 'inbound' ? link.source : link.target);
      if (depths.has(neighborId)) continue;
      depths.set(neighborId, depths.get(id) + 1);
      queue.push(neighborId);
    }
  }
  return depths;
}

function sortNodes(nodes) {
  return nodes.sort((a, b) => (
    String(a.label ?? a.id).localeCompare(String(b.label ?? b.id))
    || String(a.id).localeCompare(String(b.id))
  ));
}

function placeLane(nodes, x) {
  const ordered = sortNodes(nodes);
  for (let index = 0; index < ordered.length; index += 1) {
    const node = ordered[index];
    node.x = x;
    node.y = (index - (ordered.length - 1) / 2) * IMPACT_ROW_GAP;
    node.vx = 0;
    node.vy = 0;
    node.fx = null;
    node.fy = null;
  }
}

function callFileGroup(node) {
  return String(node?.file ?? node?.path ?? '(unknown file)')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .trim() || '(unknown file)';
}

function impactBandColumns(nodeCount) {
  return Math.max(
    IMPACT_BAND_MIN_COLUMNS,
    Math.min(IMPACT_BAND_MAX_COLUMNS, Math.ceil(Math.sqrt(nodeCount))),
  );
}

function fileBandedPlacements(nodes, columns) {
  const groups = new Map();
  for (const node of nodes) {
    const file = callFileGroup(node);
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file).push(node);
  }

  const placements = [];
  let row = 0;
  let column = 0;
  const orderedGroups = [...groups]
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [file, members] of orderedGroups) {
    const ordered = sortNodes(members);
    let cursor = 0;
    while (cursor < ordered.length) {
      const remaining = columns - column;
      const unplaced = ordered.length - cursor;
      if (column > 0 && unplaced <= columns && unplaced > remaining) {
        row += 1;
        column = 0;
      }
      const take = Math.min(columns - column, ordered.length - cursor);
      for (let offset = 0; offset < take; offset += 1) {
        placements.push({ node: ordered[cursor + offset], file, row, column: column + offset });
      }
      cursor += take;
      column += take;
      if (column === columns || cursor < ordered.length) {
        row += 1;
        column = 0;
      }
    }
  }
  return placements;
}

function placeFileBandedLane(nodes, x, role) {
  const columns = impactBandColumns(nodes.length);
  const placements = fileBandedPlacements(nodes, columns);
  const maxRadius = Math.max(...nodes.map((node) => Math.max(1, Number(node.radius) || 0)));
  const columnGap = Math.max(IMPACT_BAND_MIN_COLUMN_GAP, maxRadius * 2 + 14);
  const rowGap = Math.max(IMPACT_BAND_MIN_ROW_GAP, maxRadius * 2 + 18);
  const rowCount = Math.max(1, ...placements.map((placement) => placement.row + 1));

  for (const placement of placements) {
    const { node, file, row, column } = placement;
    node.callFileGroup = file;
    node.callBandRow = row;
    node.callBandColumn = column;
    if (role === 'both') {
      node.x = (column - (columns - 1) / 2) * columnGap;
      const band = Math.floor(row / 2) + 1;
      node.y = band * rowGap * (row % 2 === 0 ? 1 : -1);
    } else {
      node.x = x + (role === 'inbound' ? -1 : 1) * column * columnGap;
      node.y = (row - (rowCount - 1) / 2) * rowGap;
    }
    resetNodeMotion(node);
  }
}

function resetNodeMotion(node) {
  node.vx = 0;
  node.vy = 0;
  node.fx = null;
  node.fy = null;
}

function classifyRelations(model, focus, layoutName) {
  const focusId = String(focus);
  if (!model?.indexes?.nodesById.has(focusId)) {
    throw new TypeError(`${layoutName} focus is missing from the model: ${focusId}`);
  }

  const inboundDepths = directedDepths(model.indexes, focusId, 'inbound');
  const outboundDepths = directedDepths(model.indexes, focusId, 'outbound');
  for (const node of model.nodes) {
    const id = String(node.id);
    const inboundDepth = inboundDepths.get(id);
    const outboundDepth = outboundDepths.get(id);
    node.focus = id === focusId;

    if (id === focusId) {
      node.relationRole = 'focus';
      node.relationDepth = 0;
    } else if (inboundDepth != null && outboundDepth != null) {
      node.relationRole = 'both';
      node.relationDepth = Math.min(inboundDepth, outboundDepth);
    } else if (inboundDepth != null) {
      node.relationRole = 'inbound';
      node.relationDepth = inboundDepth;
    } else if (outboundDepth != null) {
      node.relationRole = 'outbound';
      node.relationDepth = outboundDepth;
    } else {
      node.relationRole = 'context';
      node.relationDepth = null;
    }
  }

  for (const link of model.links) {
    const sourceRole = model.indexes.nodesById.get(endpointId(link.source))?.relationRole;
    const targetRole = model.indexes.nodesById.get(endpointId(link.target))?.relationRole;
    if (sourceRole === 'both' || targetRole === 'both') link.relationRole = 'both';
    else if (sourceRole === 'inbound' || targetRole === 'inbound') link.relationRole = 'inbound';
    else if (sourceRole === 'outbound' || targetRole === 'outbound') link.relationRole = 'outbound';
    else link.relationRole = 'context';
  }

  return focusId;
}

function deterministicController(id) {
  return {
    id,
    kind: 'deterministic',
    simulation: null,
    warmupTicks: () => 0,
    configure() {},
    setMotion() {},
    tick() {},
    shouldContinue: () => false,
    dispose() {},
  };
}

function arcCapacityRadius(nodes, span, closed = false) {
  if (nodes.length <= 1) return 0;
  const steps = closed ? nodes.length : nodes.length - 1;
  const angle = Math.abs(span) / steps;
  const diameter = Math.max(...nodes.map((node) => Math.max(1, Number(node.radius) || 0))) * 2;
  return (diameter + RADIAL_NODE_GAP) / (2 * Math.sin(angle / 2));
}

function placeArc(nodes, radius, startAngle, endAngle) {
  const ordered = sortNodes(nodes);
  const closed = Math.abs(endAngle - startAngle) >= Math.PI * 2 - 1e-9;
  for (let index = 0; index < ordered.length; index += 1) {
    const ratio = ordered.length === 1 ? 0.5 : index / (closed ? ordered.length : ordered.length - 1);
    const angle = startAngle + (endAngle - startAngle) * ratio;
    const node = ordered[index];
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
    resetNodeMotion(node);
  }
}

function placeBidirectional(nodes, radius) {
  const ordered = sortNodes(nodes);
  const top = ordered.filter((_, index) => index % 2 === 0);
  const bottom = ordered.filter((_, index) => index % 2 === 1);
  placeArc(top, radius, -Math.PI * 0.61, -Math.PI * 0.39);
  placeArc(bottom, radius, Math.PI * 0.39, Math.PI * 0.61);
}

function radialRadii(rings, maxDepth) {
  const radii = new Map();
  let previous = 0;
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const inbound = rings.get(`inbound:${depth}`) || [];
    const outbound = rings.get(`outbound:${depth}`) || [];
    const both = sortNodes([...(rings.get(`both:${depth}`) || [])]);
    const top = both.filter((_, index) => index % 2 === 0);
    const bottom = both.filter((_, index) => index % 2 === 1);
    const capacity = Math.max(
      arcCapacityRadius(inbound, Math.PI * 0.66),
      arcCapacityRadius(outbound, Math.PI * 0.66),
      arcCapacityRadius(top, Math.PI * 0.22),
      arcCapacityRadius(bottom, Math.PI * 0.22),
    );
    const radius = Math.max(depth * RADIAL_RING_GAP, previous + RADIAL_RING_GAP, capacity);
    radii.set(depth, radius);
    previous = radius;
  }
  return radii;
}

function territoryWeight(node) {
  const size = Number(node?.size);
  if (Number.isFinite(size) && size > 0) return size;
  const degree = Number(node?.degree);
  return Number.isFinite(degree) && degree > 0 ? degree : 1;
}

function assignFolderAnchors(nodes) {
  const groups = [...new Set(nodes.map(fileGroupForNode))]
    .sort((left, right) => left.localeCompare(right));
  const columns = Math.max(1, Math.ceil(Math.sqrt(groups.length)));
  const rows = Math.max(1, Math.ceil(groups.length / columns));
  const anchors = new Map(groups.map((group, index) => [group, {
    x: (index % columns - (columns - 1) / 2) * HOTSPOT_COLUMN_GAP,
    y: (Math.floor(index / columns) - (rows - 1) / 2) * HOTSPOT_ROW_GAP,
  }]));

  for (const node of nodes) {
    const group = fileGroupForNode(node);
    const anchor = anchors.get(group);
    node.folderGroup = group;
    node.folderAnchorX = anchor.x;
    node.folderAnchorY = anchor.y;
  }
}

function placeHotspotClusterGrid(nodes) {
  const grouped = new Map();
  for (const node of nodes) {
    const group = fileGroupForNode(node);
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(node);
  }
  const layouts = [...grouped]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([group, members]) => {
      const ordered = sortNodes(members);
      const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)));
      const rows = Math.max(1, Math.ceil(ordered.length / columns));
      const diameter = Math.max(...ordered.map((node) => Math.max(1, Number(node.radius) || 0) * 2));
      const spacing = diameter + HOTSPOT_GRID_GAP;
      return {
        group,
        nodes: ordered,
        columns,
        rows,
        spacing,
        width: Math.max(diameter, (columns - 1) * spacing + diameter),
        height: Math.max(diameter, (rows - 1) * spacing + diameter),
      };
    });
  const groupColumns = Math.max(1, Math.ceil(Math.sqrt(layouts.length)));
  const groupRows = Math.max(1, Math.ceil(layouts.length / groupColumns));
  const stepX = Math.max(HOTSPOT_COLUMN_GAP, ...layouts.map((layout) => layout.width + HOTSPOT_GROUP_GAP));
  const stepY = Math.max(HOTSPOT_ROW_GAP, ...layouts.map((layout) => layout.height + HOTSPOT_GROUP_GAP));

  for (let groupIndex = 0; groupIndex < layouts.length; groupIndex += 1) {
    const layout = layouts[groupIndex];
    const anchorX = (groupIndex % groupColumns - (groupColumns - 1) / 2) * stepX;
    const anchorY = (Math.floor(groupIndex / groupColumns) - (groupRows - 1) / 2) * stepY;
    for (let index = 0; index < layout.nodes.length; index += 1) {
      const node = layout.nodes[index];
      node.folderGroup = layout.group;
      node.folderAnchorX = anchorX;
      node.folderAnchorY = anchorY;
      node.x = anchorX + (index % layout.columns - (layout.columns - 1) / 2) * layout.spacing;
      node.y = anchorY + (Math.floor(index / layout.columns) - (layout.rows - 1) / 2) * layout.spacing;
      resetNodeMotion(node);
    }
  }
}

function hotspotUsesPhysics(model, options) {
  const maxNodes = Math.max(0, Number(options.maxPhysicsNodes ?? HOTSPOT_MAX_PHYSICS_NODES));
  const maxLinks = Math.max(0, Number(options.maxPhysicsLinks ?? HOTSPOT_MAX_PHYSICS_LINKS));
  return model.nodes.length <= maxNodes && model.links.length <= maxLinks;
}

function applyHotspotPositionForces(d3, simulation, settings) {
  const strength = Math.max(HOTSPOT_CLUSTER_STRENGTH, Number(settings.centerForce) || 0);
  simulation
    .force('x', d3.forceX((node) => node.folderAnchorX).strength(strength))
    .force('y', d3.forceY((node) => node.folderAnchorY).strength(strength));
}

export function createForceLayoutController(d3, model, settings, options = {}) {
  const center = { cx: options.cx ?? 0, cy: options.cy ?? 0 };
  const simulation = buildForces(d3, model.nodes, model.links, settings, center).stop();
  simulation.alphaTarget(settings.animate ? MOTION_ALPHA_TARGET : 0);

  return {
    id: 'constellation',
    kind: 'dynamic',
    simulation,
    warmupTicks(reusedPositions) {
      return reusedPositions ? 4 : Math.min(36, 12 + model.nodes.length);
    },
    configure(nextSettings) {
      applyForces(d3, simulation, nextSettings, center);
      simulation.alphaTarget(nextSettings.animate ? MOTION_ALPHA_TARGET : 0).stop();
    },
    setMotion(enabled) {
      simulation
        .alphaTarget(enabled ? MOTION_ALPHA_TARGET : 0)
        .alpha(Math.max(0.12, simulation.alpha()))
        .stop();
    },
    tick(keepMoving = false) {
      if (keepMoving && simulation.alpha() < 0.025) simulation.alpha(MOTION_ALPHA_FLOOR);
      simulation.tick();
    },
    shouldContinue(keepMoving = false) {
      return keepMoving || simulation.alpha() > simulation.alphaMin();
    },
    dispose() {
      simulation.stop();
    },
  };
}

export function createNodesLayoutController(d3, model, settings, options = {}) {
  return {
    ...createForceLayoutController(d3, model, settings, options),
    id: 'nodes',
  };
}

export function createHotspotLayoutController(d3, model, settings, options = {}) {
  const center = { cx: options.cx ?? 0, cy: options.cy ?? 0 };
  if (!hotspotUsesPhysics(model, options)) {
    placeHotspotClusterGrid(model.nodes);
    return {
      ...deterministicController('hotspot-landscape'),
      scaleMode: 'cluster-grid',
    };
  }
  assignFolderAnchors(model.nodes);
  const simulation = buildForces(d3, model.nodes, model.links, settings, center).stop();
  applyHotspotPositionForces(d3, simulation, settings);
  simulation.alphaTarget(settings.animate ? MOTION_ALPHA_TARGET : 0);

  return {
    id: 'hotspot-landscape',
    kind: 'dynamic',
    simulation,
    warmupTicks(reusedPositions) {
      return reusedPositions ? 4 : Math.min(42, 14 + model.nodes.length);
    },
    configure(nextSettings) {
      applyForces(d3, simulation, nextSettings, center);
      applyHotspotPositionForces(d3, simulation, nextSettings);
      simulation.alphaTarget(nextSettings.animate ? MOTION_ALPHA_TARGET : 0).stop();
    },
    setMotion(enabled) {
      simulation
        .alphaTarget(enabled ? MOTION_ALPHA_TARGET : 0)
        .alpha(Math.max(0.12, simulation.alpha()))
        .stop();
    },
    tick(keepMoving = false) {
      if (keepMoving && simulation.alpha() < 0.025) simulation.alpha(MOTION_ALPHA_FLOOR);
      simulation.tick();
    },
    shouldContinue(keepMoving = false) {
      return keepMoving || simulation.alpha() > simulation.alphaMin();
    },
    dispose() {
      simulation.stop();
    },
  };
}

export function createTerritoryLayoutController(d3, model, options = {}) {
  if (typeof d3?.hierarchy !== 'function' || typeof d3?.treemap !== 'function') {
    throw new TypeError('Territory layout requires D3 hierarchy and treemap');
  }
  const width = Math.max(120, Number(options.width) || TERRITORY_WIDTH);
  const height = Math.max(120, Number(options.height) || TERRITORY_HEIGHT);
  const gap = Math.max(0, Number(options.gap) || TERRITORY_GAP);
  const ordered = sortNodes([...model.nodes]);
  const root = d3.hierarchy({ children: ordered })
    .sum((node) => (Array.isArray(node.children) ? 0 : territoryWeight(node)))
    .sort((left, right) => (
      (right.value || 0) - (left.value || 0)
      || String(left.data?.label ?? left.data?.id ?? '').localeCompare(
        String(right.data?.label ?? right.data?.id ?? ''),
      )
    ));

  d3.treemap()
    .tile(d3.treemapBinary)
    .size([width, height])
    .paddingOuter(gap)
    .paddingInner(gap)
    .round(false)(root);

  for (const leaf of root.leaves()) {
    const node = leaf.data;
    node.territory = {
      x0: leaf.x0 - width / 2,
      y0: leaf.y0 - height / 2,
      x1: leaf.x1 - width / 2,
      y1: leaf.y1 - height / 2,
    };
    node.x = (node.territory.x0 + node.territory.x1) / 2;
    node.y = (node.territory.y0 + node.territory.y1) / 2;
    resetNodeMotion(node);
  }

  return deterministicController('territory');
}

export function createDependencyMatrixLayoutController(model, options = {}) {
  const matrix = buildDependencyMatrix(model);
  const requestedSize = Number(options.cellSize);
  const automaticSize = MATRIX_TARGET_SIZE / Math.max(1, matrix.nodes.length);
  const cellSize = Math.min(
    MATRIX_MAX_CELL_SIZE,
    Math.max(MATRIX_MIN_CELL_SIZE, Number.isFinite(requestedSize) ? requestedSize : automaticSize),
  );
  const dimension = cellSize * matrix.nodes.length;
  const originX = -dimension / 2;
  const originY = -dimension / 2;

  for (let index = 0; index < matrix.nodes.length; index += 1) {
    const node = matrix.nodes[index];
    node.matrixIndex = index;
    node.x = originX + (index + 0.5) * cellSize;
    node.y = originY + (index + 0.5) * cellSize;
    resetNodeMotion(node);
  }

  const cells = matrix.cells.map((cell) => ({
    ...cell,
    x: originX + (cell.targetIndex + 0.5) * cellSize,
    y: originY + (cell.sourceIndex + 0.5) * cellSize,
    size: cellSize,
  }));
  const cellByCoordinate = new Map(
    cells.map((cell) => [`${cell.sourceIndex}:${cell.targetIndex}`, cell]),
  );

  return {
    ...deterministicController('dependency-matrix'),
    matrix: {
      ...matrix,
      cells,
      cellByCoordinate,
      cellSize,
      dimension,
      originX,
      originY,
    },
  };
}

export function createStructureTreeLayoutController(model, options = {}) {
  const columnGap = Math.max(80, Number(options.columnGap) || 240);
  const rowGap = Math.max(32, Number(options.rowGap) || 68);
  const requestedCollapsedIds = new Set(
    [...(options.collapsedIds || [])].map((id) => String(id)),
  );
  const nodesById = model?.indexes?.nodesById;
  if (!(nodesById instanceof Map)) {
    throw new TypeError('Structure tree requires an indexed graph model');
  }

  const ordered = sortNodes([...model.nodes]);
  const childrenById = new Map(ordered.map((node) => [String(node.id), []]));
  const roots = [];
  for (const node of ordered) {
    const id = String(node.id);
    const parentId = node.parent == null ? null : String(node.parent);
    if (parentId && parentId !== id && childrenById.has(parentId)) {
      childrenById.get(parentId).push(id);
      node.treeParentId = parentId;
    } else {
      roots.push(id);
      node.treeParentId = null;
    }
  }
  for (const children of childrenById.values()) {
    children.sort((leftId, rightId) => {
      const left = nodesById.get(leftId);
      const right = nodesById.get(rightId);
      return String(left?.label ?? leftId).localeCompare(String(right?.label ?? rightId))
        || leftId.localeCompare(rightId);
    });
  }
  roots.sort((leftId, rightId) => {
    const left = nodesById.get(leftId);
    const right = nodesById.get(rightId);
    return String(left?.label ?? leftId).localeCompare(String(right?.label ?? rightId))
      || leftId.localeCompare(rightId);
  });

  const collapsedIds = new Set(
    [...requestedCollapsedIds].filter((id) => (childrenById.get(id)?.length || 0) > 0),
  );
  const hiddenNodeIds = new Set();
  function hideDescendants(id, seen = new Set()) {
    if (seen.has(id)) return;
    seen.add(id);
    for (const childId of childrenById.get(id) || []) {
      hiddenNodeIds.add(childId);
      hideDescendants(childId, seen);
    }
  }
  for (const id of collapsedIds) hideDescendants(id);
  for (const node of model.nodes) {
    const id = String(node.id);
    node.treeHasChildren = (childrenById.get(id)?.length || 0) > 0;
    node.treeHidden = hiddenNodeIds.has(id);
    node.treeCollapsed = collapsedIds.has(id);
  }

  const visited = new Set();
  const visibleNodeIds = new Set();
  let leafIndex = 0;
  let maxDepth = 0;
  function place(id, depth) {
    const node = nodesById.get(id);
    if (!node || node.treeHidden || visited.has(id)) return null;
    visited.add(id);
    visibleNodeIds.add(id);
    node.treeDepth = depth;
    node.x = depth * columnGap;
    maxDepth = Math.max(maxDepth, depth);
    const childPositions = [];
    for (const childId of childrenById.get(id) || []) {
      const childY = place(childId, depth + 1);
      if (Number.isFinite(childY)) childPositions.push(childY);
    }
    node.y = childPositions.length
      ? childPositions.reduce((sum, value) => sum + value, 0) / childPositions.length
      : leafIndex++ * rowGap;
    resetNodeMotion(node);
    return node.y;
  }

  for (const rootId of [...roots]) place(rootId, 0);
  for (const node of ordered) {
    const id = String(node.id);
    if (node.treeHidden || visited.has(id)) continue;
    roots.push(id);
    node.treeParentId = null;
    place(id, 0);
  }

  const rootY = roots.length
    ? roots.reduce((sum, id) => sum + (nodesById.get(id)?.y || 0), 0) / roots.length
    : 0;
  for (const node of model.nodes) node.y -= rootY;

  return {
    ...deterministicController('structure-tree'),
    tree: {
      roots,
      childrenById,
      collapsedIds,
      hiddenNodeIds,
      visibleNodeIds,
      maxDepth,
      columnGap,
      rowGap,
    },
  };
}

export function createImpactFlowLayoutController(model, focus) {
  const focusId = classifyRelations(model, focus, 'Impact flow');
  const lanes = new Map();
  const centerBand = [];
  const contextBand = [];

  for (const node of model.nodes) {
    const id = String(node.id);

    if (id === focusId) {
      node.x = 0;
      node.y = 0;
      resetNodeMotion(node);
    } else if (node.relationRole === 'both') {
      centerBand.push(node);
    } else if (node.relationRole === 'inbound' || node.relationRole === 'outbound') {
      const key = `${node.relationRole}:${node.relationDepth}`;
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key).push(node);
    } else {
      contextBand.push(node);
    }
  }

  let dense = false;
  for (const [key, nodes] of lanes) {
    const [role, rawDepth] = key.split(':');
    const depth = Number(rawDepth);
    const x = (role === 'inbound' ? -1 : 1) * depth * IMPACT_LANE_GAP;
    if (nodes.length > IMPACT_DENSE_LANE_THRESHOLD) {
      placeFileBandedLane(nodes, x, role);
      dense = true;
    } else {
      placeLane(nodes, x);
    }
  }

  const orderedCenter = sortNodes(centerBand);
  if (orderedCenter.length > IMPACT_DENSE_LANE_THRESHOLD) {
    placeFileBandedLane(orderedCenter, 0, 'both');
    dense = true;
  } else {
    for (let index = 0; index < orderedCenter.length; index += 1) {
      const node = orderedCenter[index];
      node.x = 0;
      node.y = (index + 1) * IMPACT_ROW_GAP * (index % 2 ? -1 : 1);
      resetNodeMotion(node);
    }
  }

  const orderedContext = sortNodes(contextBand);
  for (let index = 0; index < orderedContext.length; index += 1) {
    const node = orderedContext[index];
    node.x = 0;
    node.y = (orderedCenter.length + index + 1) * IMPACT_ROW_GAP;
    resetNodeMotion(node);
  }

  return {
    ...deterministicController('impact-flow'),
    densityMode: dense ? 'file-bands' : 'linear',
  };
}

export function createRadialReachLayoutController(model, focus) {
  const focusId = classifyRelations(model, focus, 'Radial reach');
  const rings = new Map();
  let maxDepth = 0;

  for (const node of model.nodes) {
    if (String(node.id) === focusId) {
      node.x = 0;
      node.y = 0;
      resetNodeMotion(node);
      continue;
    }
    if (node.relationDepth == null) continue;
    maxDepth = Math.max(maxDepth, node.relationDepth);
    const key = `${node.relationRole}:${node.relationDepth}`;
    if (!rings.has(key)) rings.set(key, []);
    rings.get(key).push(node);
  }

  const radii = radialRadii(rings, maxDepth);

  for (const [key, nodes] of rings) {
    const [role, rawDepth] = key.split(':');
    const depth = Number(rawDepth);
    const radius = radii.get(depth);
    if (role === 'inbound') placeArc(nodes, radius, Math.PI * 0.67, Math.PI * 1.33);
    else if (role === 'outbound') placeArc(nodes, radius, -Math.PI * 0.33, Math.PI * 0.33);
    else placeBidirectional(nodes, radius);
  }

  const context = model.nodes.filter((node) => node.relationRole === 'context');
  if (context.length) {
    const radius = Math.max(
      (radii.get(maxDepth) || 0) + RADIAL_RING_GAP,
      (maxDepth + 1) * RADIAL_RING_GAP,
      arcCapacityRadius(context, Math.PI * 2, true),
    );
    placeArc(context, radius, 0, Math.PI * 2);
  }

  return deterministicController('radial-reach');
}
