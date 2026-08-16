// public/app/render.js — paint graph layouts and evidence on a single canvas.

import { landmarkBudget, selectLandmarkIds } from './landmarks.js';
import { callLinkKey, findLoadedCallPath } from './callPath.js';
import {
  chooseLabelPlacement,
  fitLabelPlacement,
  labelCapsuleGeometry,
  labelPlacementCandidates,
} from './labelPlacement.js';
import { canvasLabelMaxWidth, fitCanvasLabel } from './labelText.js';
import { nodeKindShape, nodeShapePolygon } from './nodeShape.js';

const TAU = Math.PI * 2;
const LABEL_FONT = 'ui-monospace, "SF Mono", Menlo, monospace';
const ARROW_ZOOM = 1.65;
const LABEL_FADE_RANGE = 0.65;
const DEFAULT_LABEL_SIZE = 13;
const MIN_LABEL_SIZE = 10;
const MAX_LABEL_SIZE = 24;
const VIEWPORT_MARGIN = 48;
export const HOTSPOT_OVERVIEW_LINK_LIMIT = 240;
export const CYCLE_OVERVIEW_MARKER_LIMIT = 160;
export const IMPACT_OVERVIEW_LINK_LIMIT = 40;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function labelOpacity(transformScale, threshold = 0) {
  const revealAt = clamp(finiteNumber(threshold, 0), 0, 1);
  if (revealAt === 0) return 1;
  const scale = Math.max(0.0001, finiteNumber(transformScale, 1));
  return clamp((scale - revealAt) / LABEL_FADE_RANGE, 0, 1);
}

export function labelFontSize(settings = {}, emphasized = false) {
  const base = clamp(
    finiteNumber(settings?.labelSize, DEFAULT_LABEL_SIZE),
    MIN_LABEL_SIZE,
    MAX_LABEL_SIZE,
  );
  return emphasized ? Math.min(MAX_LABEL_SIZE + 2, base + 2) : base;
}

export function labelBudget(size = {}, transformScale = 1, density = 'balanced') {
  const presets = {
    minimal: { factor: 0.45, min: 8, max: 80 },
    balanced: { factor: 1, min: 24, max: 220 },
    dense: { factor: 1.8, min: 40, max: 400 },
  };
  const preset = presets[density] || presets.balanced;
  const area = Math.max(0, finiteNumber(size.width, 0)) * Math.max(0, finiteNumber(size.height, 0));
  const rawZoom = Math.max(0.0001, finiteNumber(transformScale, 1));
  const zoom = clamp(rawZoom, 1, 2.25);
  const budget = clamp(Math.floor((area / 9500) * zoom * preset.factor), preset.min, preset.max);
  if (rawZoom > 0.75) return budget;
  const landmarks = landmarkBudget(size);
  const overviewCap = density === 'dense' ? Math.ceil(landmarks * 1.5) : landmarks;
  return Math.min(budget, overviewCap);
}

export function matrixCellOpacity(weight, maxWeight) {
  const value = Math.max(0, finiteNumber(weight, 0));
  const maximum = Math.max(0, finiteNumber(maxWeight, 0));
  if (value === 0 || maximum === 0) return 0;
  if (value >= maximum) return 0.9;
  return 0.18 + 0.72 * Math.sqrt(clamp(value / maximum, 0, 1));
}

export function matrixHeaderStep(count, budget = 40, screenCellSize = 0, labelSpacing = 12) {
  const total = Math.max(0, Math.floor(finiteNumber(count, 0)));
  const limit = Math.max(1, Math.floor(finiteNumber(budget, 40)));
  const cell = Math.max(0, finiteNumber(screenCellSize, 0));
  const spacing = Math.max(1, finiteNumber(labelSpacing, 12));
  const collisionStep = cell > 0 ? Math.ceil(spacing / cell) : 1;
  return Math.max(1, Math.ceil(total / limit), collisionStep);
}

export function structureTreeNodeShape(node) {
  return String(node?.kind ?? '').trim().toLowerCase() === 'folder' ? 'folder' : 'file';
}

export function structureTreeDisclosureMark(node) {
  if (structureTreeNodeShape(node) !== 'folder' || !node?.treeHasChildren) return null;
  return node.treeCollapsed ? 'expand' : 'collapse';
}

export function structureTreeLabelLimit(availableWidth, fontSize) {
  const width = Math.max(0, finiteNumber(availableWidth, 0));
  const size = Math.max(1, finiteNumber(fontSize, DEFAULT_LABEL_SIZE));
  return clamp(Math.floor(width / (size * 0.6)), 3, 96);
}

export function structureTreeElbow(source, target) {
  const middleX = (finiteNumber(source?.x, 0) + finiteNumber(target?.x, 0)) / 2;
  return [
    { x: finiteNumber(source?.x, 0), y: finiteNumber(source?.y, 0) },
    { x: middleX, y: finiteNumber(source?.y, 0) },
    { x: middleX, y: finiteNumber(target?.y, 0) },
    { x: finiteNumber(target?.x, 0), y: finiteNumber(target?.y, 0) },
  ];
}

export function radialGuideLabels(nodes = []) {
  const byDepth = new Map();
  for (const node of nodes) {
    const depth = Number(node?.relationDepth);
    if (!(depth > 0) || !hasFinitePosition(node)) continue;
    const radius = Math.hypot(node.x, node.y);
    if (!byDepth.has(depth) && Number.isFinite(radius)) byDepth.set(depth, radius);
  }
  return [...byDepth.entries()]
    .sort(([left], [right]) => left - right)
    .map(([depth, radius]) => ({
      depth,
      radius,
      label: `${depth} ${depth === 1 ? 'hop' : 'hops'}`,
    }));
}

export function radialGuideRadii(nodes = []) {
  return radialGuideLabels(nodes).map(({ radius }) => radius);
}

export function cycleMarkerVisible(view, node) {
  return view === 'filedeps' && Boolean(node?.inCycle);
}

export function cycleMarkerItems(items, options = {}) {
  const view = options.view;
  const cyclic = items.filter((item) => cycleMarkerVisible(view, item.node));
  const zoom = Math.max(0.0001, finiteNumber(options.zoom, 1));
  const limit = Math.max(1, Math.floor(finiteNumber(options.limit, CYCLE_OVERVIEW_MARKER_LIMIT)));
  const totalCycleCount = Math.max(0, Math.floor(finiteNumber(options.totalCycleCount, cyclic.length)));
  if (zoom > 0.75 || totalCycleCount <= limit) return cyclic;
  return cyclic.filter((item) => item.highlighted);
}

function convexHull(points) {
  const ordered = [...points].sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  if (ordered.length <= 2) return ordered;
  const cross = (origin, left, right) => (
    (left[0] - origin[0]) * (right[1] - origin[1])
    - (left[1] - origin[1]) * (right[0] - origin[0])
  );
  const lower = [];
  for (const point of ordered) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const point = ordered[index];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function circlePolygon(x, y, radius, sides = 12) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + (index / sides) * TAU;
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
  });
}

function expandedHull(nodes, padding) {
  const centers = nodes.map((node) => [node.x, node.y]);
  const margin = padding + Math.max(...nodes.map((node) => Math.max(0, finiteNumber(node.radius, 0))));
  const hull = convexHull(centers);
  if (hull.length === 1) return circlePolygon(hull[0][0], hull[0][1], margin);
  if (hull.length === 2) {
    const [[ax, ay], [bx, by]] = hull;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / length;
    const uy = (by - ay) / length;
    const nx = -uy;
    const ny = ux;
    return [
      [ax - ux * margin + nx * margin, ay - uy * margin + ny * margin],
      [bx + ux * margin + nx * margin, by + uy * margin + ny * margin],
      [bx + ux * margin - nx * margin, by + uy * margin - ny * margin],
      [ax - ux * margin - nx * margin, ay - uy * margin - ny * margin],
    ];
  }

  const center = hull.reduce(
    (result, [x, y]) => ({ x: result.x + x / hull.length, y: result.y + y / hull.length }),
    { x: 0, y: 0 },
  );
  return hull.map(([x, y]) => {
    const dx = x - center.x;
    const dy = y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    return [x + (dx / length) * margin, y + (dy / length) * margin];
  });
}

export function folderClusterHulls(nodes = [], padding = 28) {
  const groups = new Map();
  for (const node of nodes) {
    if (!node?.folderGroup || !hasFinitePosition(node)) continue;
    if (!groups.has(node.folderGroup)) groups.set(node.folderGroup, []);
    groups.get(node.folderGroup).push(node);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, members]) => {
      const points = expandedHull(members, Math.max(0, finiteNumber(padding, 28)));
      const left = Math.min(...points.map(([x]) => x));
      const top = Math.min(...points.map(([, y]) => y));
      return { id, points, labelX: left + 10, labelY: top + 10 };
    });
}

export function createFolderHullCache() {
  let cachedNodes = null;
  let cachedHulls = null;
  return {
    get(nodes = [], { stable = false } = {}) {
      if (stable && nodes === cachedNodes) return cachedHulls;
      const hulls = folderClusterHulls(nodes);
      if (stable) {
        cachedNodes = nodes;
        cachedHulls = hulls;
      }
      return hulls;
    },
  };
}

function nodeId(node) {
  if (node && typeof node === 'object') return String(node.id);
  return String(node);
}

export function hotspotOverviewLinks(links, options = {}) {
  const limit = Math.max(1, Math.floor(finiteNumber(options.limit, HOTSPOT_OVERVIEW_LINK_LIMIT)));
  const totalLinkCount = Math.max(0, Math.floor(finiteNumber(options.totalLinkCount, links.length)));
  const zoom = Math.max(0.0001, finiteNumber(options.zoom, 1));
  if (zoom > 0.75 || totalLinkCount <= limit * 2) return links;

  const highlighted = links.filter((link) => link.highlighted);
  if (highlighted.length) return highlighted;
  return [...links]
    .sort((left, right) => (
      finiteNumber(right.weight, 1) - finiteNumber(left.weight, 1)
      || nodeId(left.source).localeCompare(nodeId(right.source))
      || nodeId(left.target).localeCompare(nodeId(right.target))
    ))
    .slice(0, limit);
}

export function hotspotOverviewNodes(items, options = {}) {
  const totalNodeCount = Math.max(0, Math.floor(finiteNumber(options.totalNodeCount, items.length)));
  const zoom = Math.max(0.0001, finiteNumber(options.zoom, 1));
  if (zoom > 0.75 || totalNodeCount <= 1_000) return items;
  const highlighted = items.filter((item) => item.highlighted);
  return highlighted.length ? highlighted : items;
}

export function impactOverviewActive(options = {}) {
  const limit = Math.max(1, Math.floor(finiteNumber(options.limit, IMPACT_OVERVIEW_LINK_LIMIT)));
  const totalLinkCount = Math.max(0, Math.floor(finiteNumber(options.totalLinkCount, 0)));
  const zoom = Math.max(0.0001, finiteNumber(options.zoom, 1));
  return zoom <= 1 && totalLinkCount > limit * 2;
}

function stableImpactLinks(links) {
  return [...links].sort((left, right) => (
    finiteNumber(right.weight, 1) - finiteNumber(left.weight, 1)
    || nodeId(left.source).localeCompare(nodeId(right.source))
    || nodeId(left.target).localeCompare(nodeId(right.target))
  ));
}

export function impactOverviewLinks(links, options = {}) {
  const limit = Math.max(1, Math.floor(finiteNumber(options.limit, IMPACT_OVERVIEW_LINK_LIMIT)));
  const highlighted = links.filter((link) => link.highlighted);
  if (highlighted.length) return highlighted;
  if (!impactOverviewActive({ ...options, limit })) return links;

  const focusId = options.focusId == null ? null : String(options.focusId);
  const incoming = [];
  const outgoing = [];
  const context = [];
  for (const link of links) {
    const sourceId = nodeId(link.source);
    const targetId = nodeId(link.target);
    if (focusId != null && targetId === focusId && sourceId !== focusId) incoming.push(link);
    else if (focusId != null && sourceId === focusId && targetId !== focusId) outgoing.push(link);
    else context.push(link);
  }

  const inbound = stableImpactLinks(incoming);
  const outbound = stableImpactLinks(outgoing);
  const representative = [];
  for (let index = 0; representative.length < limit && (index < inbound.length || index < outbound.length); index += 1) {
    if (index < inbound.length) representative.push(inbound[index]);
    if (representative.length < limit && index < outbound.length) representative.push(outbound[index]);
  }
  if (representative.length < limit) {
    representative.push(...stableImpactLinks(context).slice(0, limit - representative.length));
  }
  return representative;
}

function hasFinitePosition(node) {
  return node && Number.isFinite(node.x) && Number.isFinite(node.y);
}

function resolveEndpoint(endpoint, nodesById) {
  if (endpoint && typeof endpoint === 'object') return endpoint;
  return nodesById.get(String(endpoint));
}

function normalizeTransform(transform) {
  return {
    x: finiteNumber(transform?.x, 0),
    y: finiteNumber(transform?.y, 0),
    k: Math.max(0.0001, finiteNumber(transform?.k, 1)),
  };
}

function iterableIds(value) {
  if (!value || typeof value === 'string') return null;
  if (value instanceof Set || Array.isArray(value)) return value;
  if (typeof value[Symbol.iterator] === 'function') return value;
  return null;
}

function neighborhoodIds(neighborhood) {
  if (!neighborhood) return null;

  const candidate = neighborhood.nodes
    ?? neighborhood.nodeIds
    ?? neighborhood.ids
    ?? neighborhood;
  const iterable = iterableIds(candidate);

  if (iterable) {
    return new Set([...iterable].map((value) => nodeId(value)));
  }

  if (candidate && typeof candidate === 'object') {
    return new Set(
      Object.entries(candidate)
        .filter(([, included]) => Boolean(included))
        .map(([id]) => String(id)),
    );
  }

  return null;
}

function nodeRadius(node, settings, emphasized = false) {
  const size = Math.max(0.01, finiteNumber(settings?.nodeSize, 1));
  const radius = Math.max(0.5, finiteNumber(node.radius, 3)) * size;
  return radius * (emphasized ? 1.15 : 1);
}

function linkWidth(link, settings) {
  const weight = Math.max(0, finiteNumber(link.weight, 1));
  const scale = Math.max(0, finiteNumber(settings?.linkThickness, 1));
  return clamp(scale * (1 + Math.log2(1 + weight)), 0.5, 4);
}

function graphViewport(size, transform) {
  const margin = VIEWPORT_MARGIN / transform.k;
  return {
    left: -transform.x / transform.k - margin,
    right: (size.width - transform.x) / transform.k + margin,
    top: -transform.y / transform.k - margin,
    bottom: (size.height - transform.y) / transform.k + margin,
  };
}

function pointInViewport(node, viewport, radius = 0) {
  return node.x + radius >= viewport.left
    && node.x - radius <= viewport.right
    && node.y + radius >= viewport.top
    && node.y - radius <= viewport.bottom;
}

function linkInViewport(source, target, viewport) {
  return Math.max(source.x, target.x) >= viewport.left
    && Math.min(source.x, target.x) <= viewport.right
    && Math.max(source.y, target.y) >= viewport.top
    && Math.min(source.y, target.y) <= viewport.bottom;
}

function drawRadialGuides(ctx, nodes, theme, zoom) {
  const radii = radialGuideRadii(nodes);
  if (!radii.length) return;
  const maxRadius = radii.at(-1);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = theme.muted;
  ctx.lineWidth = 0.8 / zoom;
  ctx.setLineDash([4 / zoom, 7 / zoom]);
  for (const radius of radii) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  ctx.moveTo(0, -maxRadius);
  ctx.lineTo(0, maxRadius);
  ctx.stroke();
  ctx.restore();
}

function drawRadialDepthLabels(ctx, nodes, theme, transform, size) {
  const guides = radialGuideLabels(nodes);
  if (!guides.length) return;

  ctx.save();
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.font = `11px ${LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = theme.bg;
  ctx.fillStyle = theme.muted;
  ctx.globalAlpha = 0.82;

  // Caller/callee sectors occupy the left/right hemispheres. Keep explanatory
  // text in the intentionally empty upper sector instead of competing with data.
  const angle = -Math.PI / 2 + 0.22;
  for (const guide of guides) {
    const horizontalOffset = clamp(size.width * 0.1, 48, 110) * (guide.depth % 2 ? 1 : -1);
    const x = clamp(
      transform.x + Math.cos(angle) * guide.radius * transform.k + horizontalOffset,
      30,
      Math.max(30, size.width - 30),
    );
    const y = clamp(
      transform.y + Math.sin(angle) * guide.radius * transform.k,
      14,
      Math.max(14, size.height - 14),
    );
    ctx.strokeText(guide.label, x, y);
    ctx.fillText(guide.label, x, y);
  }
  ctx.restore();
}

function curveControl(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy);

  if (!length) return { x: source.x, y: source.y };

  const bend = clamp(length * 0.12, 6, 30);
  return {
    x: (source.x + target.x) / 2 - (dy / length) * bend,
    y: (source.y + target.y) / 2 + (dx / length) * bend,
  };
}

function appendLinkPath(ctx, link, curved) {
  const { source, target } = link;

  if (source === target || nodeId(source) === nodeId(target)) {
    const radius = Math.max(finiteNumber(source.radius, 3) * 1.8, 8);
    ctx.moveTo(source.x, source.y - radius * 0.25);
    ctx.arc(source.x + radius * 0.55, source.y - radius, radius, 2.55, 7.35);
    return;
  }

  ctx.moveTo(source.x, source.y);
  if (curved) {
    const control = link.control ?? curveControl(source, target);
    ctx.quadraticCurveTo(control.x, control.y, target.x, target.y);
  } else {
    ctx.lineTo(target.x, target.y);
  }
}

function drawLinkBuckets(ctx, buckets, zoom) {
  for (const bucket of buckets.values()) {
    ctx.beginPath();
    for (const link of bucket.links) appendLinkPath(ctx, link, bucket.curved);
    ctx.strokeStyle = bucket.color;
    ctx.globalAlpha = bucket.alpha;
    ctx.lineWidth = bucket.width / zoom;
    ctx.stroke();
  }
}

function appendArrow(ctx, link, settings, zoom) {
  const { source, target } = link;
  if (source === target || nodeId(source) === nodeId(target)) return;

  const control = link.control;
  const dx = target.x - (control?.x ?? source.x);
  const dy = target.y - (control?.y ?? source.y);
  const length = Math.hypot(dx, dy);
  if (!length) return;

  const ux = dx / length;
  const uy = dy / length;
  const targetRadius = nodeRadius(target, settings, false);
  const tipInset = targetRadius + 1.5 / zoom;
  const tipX = target.x - ux * tipInset;
  const tipY = target.y - uy * tipInset;
  const arrowLength = (4 + link.width * 0.9) / zoom;
  const arrowHalfWidth = arrowLength * 0.48;
  const baseX = tipX - ux * arrowLength;
  const baseY = tipY - uy * arrowLength;

  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX - uy * arrowHalfWidth, baseY + ux * arrowHalfWidth);
  ctx.lineTo(baseX + uy * arrowHalfWidth, baseY - ux * arrowHalfWidth);
  ctx.closePath();
}

function drawArrowBuckets(ctx, buckets, settings, zoom) {
  for (const bucket of buckets.values()) {
    ctx.beginPath();
    for (const link of bucket.links) appendArrow(ctx, link, settings, zoom);
    ctx.fillStyle = bucket.color;
    ctx.globalAlpha = bucket.alpha;
    ctx.fill();
  }
}

function bucketLink(map, link, highlighted, dimmed, curved, color) {
  const width = Math.round(link.width * 4) / 4;
  const alpha = highlighted ? 0.9 : dimmed ? 0.11 : 1;
  const key = `${color}|${width}|${alpha}|${curved ? 1 : 0}`;
  let bucket = map.get(key);

  if (!bucket) {
    bucket = { color, width, alpha, curved, links: [] };
    map.set(key, bucket);
  }
  bucket.links.push(link);
}

function semanticLinkColor(link, theme) {
  if (link.relationRole === 'inbound') return theme.inbound;
  if (link.relationRole === 'outbound') return theme.outbound;
  if (link.relationRole === 'both') return theme.bidirectional;
  if (link.relationRole === 'context') return theme.muted;
  return null;
}

function drawLinks(ctx, links, theme, settings, zoom, showArrows) {
  const idle = new Map();
  const highlighted = new Map();

  for (const link of links) {
    const color = semanticLinkColor(link, theme)
      || (link.highlighted ? theme.linkHi : theme.link);
    bucketLink(
      link.highlighted ? highlighted : idle,
      link,
      link.highlighted,
      link.dimmed,
      link.curved,
      color,
    );
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawLinkBuckets(ctx, idle, zoom);
  drawLinkBuckets(ctx, highlighted, zoom);

  // Direction markers are intentionally zoom-gated: at overview scale they
  // create more visual noise than information.
  if (showArrows) {
    drawArrowBuckets(ctx, idle, settings, zoom);
    drawArrowBuckets(ctx, highlighted, settings, zoom);
  }
}

function nodeOpacity(node, highlighted, dimmed) {
  if (dimmed) return 0.1;
  if (node.external) return highlighted ? 0.72 : 0.48;
  return highlighted ? 1 : 0.92;
}

export function nodeOutlinePattern(node, zoom = 1) {
  if (!node?.external) return [];
  const scale = Math.max(0.0001, finiteNumber(zoom, 1));
  return [3 / scale, 2 / scale];
}

function drawGlows(ctx, nodes, theme, settings, zoom, activeId, selectedId) {
  for (const node of nodes) {
    const id = nodeId(node);
    if (id !== activeId && id !== selectedId) continue;

    const radius = nodeRadius(node, settings, true);
    const halo = radius + (id === activeId ? 13 : 9) / zoom;
    const gradient = ctx.createRadialGradient(
      node.x,
      node.y,
      radius * 0.55,
      node.x,
      node.y,
      halo,
    );
    gradient.addColorStop(0, theme.glow);
    gradient.addColorStop(0.55, theme.glow);
    gradient.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.arc(node.x, node.y, halo, 0, TAU);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = id === activeId ? 1 : 0.72;
    ctx.fill();
  }
}

function bucketNode(map, node, radius, opacity) {
  const fill = node.color;
  const key = `${fill}|${opacity}`;
  let bucket = map.get(key);

  if (!bucket) {
    bucket = { fill, opacity, nodes: [] };
    map.set(key, bucket);
  }
  bucket.nodes.push({ node, radius });
}

function semanticNodeColor(node, theme) {
  if (node.relationRole === 'focus') return theme.focus;
  if (node.relationRole === 'inbound') return theme.inbound;
  if (node.relationRole === 'outbound') return theme.outbound;
  if (node.relationRole === 'both') return theme.bidirectional;
  if (node.relationRole === 'context') return theme.muted;
  return node.color;
}

function appendNodeShape(ctx, node, radius) {
  const points = nodeShapePolygon(nodeKindShape(node), radius);
  if (!points.length) {
    ctx.moveTo(node.x + radius, node.y);
    ctx.arc(node.x, node.y, radius, 0, TAU);
    return;
  }
  ctx.moveTo(node.x + points[0][0], node.y + points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(node.x + x, node.y + y);
  ctx.closePath();
}

function groupColor(node) {
  const text = String(node.path ?? node.id ?? node.label ?? 'group');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hue = 170 + (Math.abs(hash) % 135);
  return `hsl(${hue} 42% 48%)`;
}

function drawFolderHulls(ctx, hulls, zoom) {
  for (const hull of hulls) {
    if (hull.points.length < 3) continue;
    const color = groupColor({ path: hull.id });
    ctx.beginPath();
    ctx.moveTo(hull.points[0][0], hull.points[0][1]);
    for (const [x, y] of hull.points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.055;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / zoom;
    ctx.globalAlpha = 0.28;
    ctx.stroke();
  }
}

function drawFolderHullLabels(ctx, hulls, theme, transform, size) {
  if (!hulls.length) return;
  ctx.save();
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.font = `600 11px ${LABEL_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  for (const hull of hulls) {
    const x = transform.x + hull.labelX * transform.k;
    const y = transform.y + hull.labelY * transform.k;
    if (x < -100 || x > size.width + 100 || y < -30 || y > size.height + 30) continue;
    const label = `${hull.id} /`;
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = theme.bg;
    ctx.strokeText(label, x, y);
    ctx.fillStyle = theme.muted;
    ctx.fillText(label, x, y);
  }
  ctx.restore();
}

function drawMatrixCrosshair(ctx, matrix, position, theme, zoom, selected = false) {
  if (!position) return;
  const rowY = matrix.originY + position.sourceIndex * matrix.cellSize;
  const columnX = matrix.originX + position.targetIndex * matrix.cellSize;
  ctx.fillStyle = theme.linkHi;
  ctx.globalAlpha = selected ? 0.1 : 0.055;
  ctx.fillRect(matrix.originX, rowY, matrix.dimension, matrix.cellSize);
  ctx.fillRect(columnX, matrix.originY, matrix.cellSize, matrix.dimension);
  if (position.cell) {
    ctx.strokeStyle = theme.linkHi;
    ctx.lineWidth = (selected ? 2 : 1.3) / zoom;
    ctx.globalAlpha = selected ? 0.95 : 0.72;
    ctx.strokeRect(columnX, rowY, matrix.cellSize, matrix.cellSize);
  }
}

function drawDependencyMatrix(ctx, matrix, theme, zoom, hover, selection) {
  const { originX, originY, dimension, cellSize } = matrix;
  ctx.fillStyle = theme.text;
  ctx.globalAlpha = 0.025;
  ctx.fillRect(originX, originY, dimension, dimension);
  ctx.strokeStyle = theme.nodeStroke;
  ctx.lineWidth = 1 / zoom;
  ctx.globalAlpha = 0.75;
  ctx.strokeRect(originX, originY, dimension, dimension);

  for (const group of matrix.folderGroups) {
    const startX = originX + group.start * cellSize;
    const endX = originX + group.end * cellSize;
    const startY = originY + group.start * cellSize;
    const endY = originY + group.end * cellSize;
    const color = groupColor({ path: group.id });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 / zoom;
    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    ctx.moveTo(startX, originY);
    ctx.lineTo(startX, originY + dimension);
    ctx.moveTo(endX, originY);
    ctx.lineTo(endX, originY + dimension);
    ctx.moveTo(originX, startY);
    ctx.lineTo(originX + dimension, startY);
    ctx.moveTo(originX, endY);
    ctx.lineTo(originX + dimension, endY);
    ctx.stroke();
  }

  drawMatrixCrosshair(ctx, matrix, hover, theme, zoom, false);

  for (const cell of matrix.cells) {
    const source = matrix.nodes[cell.sourceIndex];
    ctx.fillStyle = groupColor({ path: source?.folderGroup ?? source?.path ?? source?.id });
    ctx.globalAlpha = matrixCellOpacity(cell.weight, matrix.maxWeight);
    const inset = Math.max(0.5 / zoom, cell.size * 0.1);
    ctx.fillRect(
      cell.x - cell.size / 2 + inset,
      cell.y - cell.size / 2 + inset,
      Math.max(0, cell.size - inset * 2),
      Math.max(0, cell.size - inset * 2),
    );
  }

  ctx.strokeStyle = theme.text;
  ctx.lineWidth = 1.1 / zoom;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([3 / zoom, 2 / zoom]);
  for (const group of matrix.cycleGroups) {
    for (const index of group.indexes) {
      const coordinate = originX + index * cellSize;
      ctx.strokeRect(coordinate, coordinate, cellSize, cellSize);
    }
  }
  ctx.setLineDash([]);
  drawMatrixCrosshair(ctx, matrix, selection, theme, zoom, true);
}

function matrixLabel(value, maxLength = 24) {
  const text = String(value ?? '');
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function drawDependencyMatrixHeaders(ctx, matrix, theme, transform, size) {
  const count = matrix.nodes.length;
  if (!count) return;
  const left = transform.x + matrix.originX * transform.k;
  const top = transform.y + matrix.originY * transform.k;
  const step = matrixHeaderStep(
    count,
    Math.max(12, Math.floor(size.height / 18)),
    matrix.cellSize * transform.k,
    12,
  );

  ctx.save();
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.font = `10px ${LABEL_FONT}`;
  ctx.fillStyle = theme.muted;
  ctx.globalAlpha = 0.78;
  ctx.textBaseline = 'middle';

  for (let index = 0; index < count; index += step) {
    const node = matrix.nodes[index];
    const rowY = top + (index + 0.5) * matrix.cellSize * transform.k;
    const columnX = left + (index + 0.5) * matrix.cellSize * transform.k;
    if (rowY >= -12 && rowY <= size.height + 12) {
      ctx.textAlign = 'right';
      ctx.fillText(matrixLabel(node.label ?? node.id), left - 7, rowY);
    }
    if (columnX >= -12 && columnX <= size.width + 12) {
      ctx.save();
      ctx.translate(columnX, top - 7);
      ctx.rotate(-Math.PI / 3);
      ctx.textAlign = 'left';
      ctx.fillText(matrixLabel(node.label ?? node.id), 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawStructureTree(ctx, nodes, links, theme, zoom, activeId, selectedId) {
  ctx.strokeStyle = theme.link;
  ctx.lineWidth = 1.1 / zoom;
  ctx.globalAlpha = 0.68;
  ctx.beginPath();
  for (const link of links) {
    const points = structureTreeElbow(link.source, link.target);
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  for (const item of nodes) {
    const { node, dimmed } = item;
    const id = nodeId(node);
    const selected = id === activeId || id === selectedId;
    const folder = structureTreeNodeShape(node) === 'folder';
    ctx.beginPath();
    if (folder) ctx.rect(node.x - 9, node.y - 7, 18, 14);
    else ctx.arc(node.x, node.y, 5, 0, TAU);
    ctx.fillStyle = node.color ?? theme.muted;
    ctx.globalAlpha = dimmed ? 0.12 : folder ? 0.42 : 0.72;
    ctx.fill();
    ctx.strokeStyle = selected ? theme.linkHi : theme.nodeStroke;
    ctx.lineWidth = (selected ? 2 : 1) / zoom;
    ctx.globalAlpha = selected ? 1 : dimmed ? 0.18 : 0.8;
    ctx.stroke();
    const disclosure = structureTreeDisclosureMark(node);
    if (disclosure) {
      ctx.beginPath();
      ctx.moveTo(node.x - 3.5, node.y);
      ctx.lineTo(node.x + 3.5, node.y);
      if (disclosure === 'expand') {
        ctx.moveTo(node.x, node.y - 3.5);
        ctx.lineTo(node.x, node.y + 3.5);
      }
      ctx.strokeStyle = selected ? theme.linkHi : theme.text;
      ctx.lineWidth = 1 / zoom;
      ctx.globalAlpha = dimmed ? 0.22 : 0.88;
      ctx.stroke();
    }
  }
}

function drawStructureTreeLabels(ctx, nodes, theme, settings, transform, size, activeId, selectedId) {
  const ordered = [...nodes].sort((left, right) => (
    finiteNumber(left.node.treeDepth, 0) - finiteNumber(right.node.treeDepth, 0)
    || left.node.y - right.node.y
  ));
  const labelsEnabled = settings?.showLabels !== false;
  const fade = labelOpacity(transform.k, settings?.labelZoom);
  const budget = labelBudget(size, transform.k, settings?.labelDensity);
  const step = matrixHeaderStep(ordered.length, budget);
  const xByDepth = new Map();
  for (const item of ordered) {
    const depth = finiteNumber(item.node.treeDepth, 0);
    if (!xByDepth.has(depth)) xByDepth.set(depth, screenPoint(item.node, transform).x);
  }
  ctx.save();
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index];
    const id = nodeId(item.node);
    const emphasized = id === activeId || id === selectedId;
    if (!emphasized && (!labelsEnabled || fade <= 0 || index % step !== 0)) continue;
    const point = screenPoint(item.node, transform);
    if (point.x < -80 || point.x > size.width + 80 || point.y < -20 || point.y > size.height + 20) continue;
    const fontSize = labelFontSize(settings, emphasized);
    const depth = finiteNumber(item.node.treeDepth, 0);
    const nextDepthX = xByDepth.get(depth + 1);
    const availableWidth = Number.isFinite(nextDepthX)
      ? nextDepthX - point.x - 20
      : size.width - point.x - 16;
    const label = matrixLabel(
      item.node.label ?? item.node.id,
      structureTreeLabelLimit(availableWidth, fontSize),
    );
    ctx.font = `${emphasized ? '600 ' : ''}${fontSize}px ${LABEL_FONT}`;
    ctx.globalAlpha = item.dimmed ? 0.12 : emphasized ? 1 : fade * 0.9;
    ctx.strokeStyle = theme.bg;
    ctx.strokeText(label, point.x + 12, point.y);
    ctx.fillStyle = emphasized ? theme.linkHi : theme.text;
    ctx.fillText(label, point.x + 12, point.y);
  }
  ctx.restore();
}

function drawNodes(ctx, nodes, theme, settings, zoom, activeId, selectedId) {
  const fills = new Map();
  const outlines = new Map();

  for (const item of nodes) {
    const { node, highlighted, dimmed } = item;
    const id = nodeId(node);
    const emphasized = id === activeId || id === selectedId;
    const radius = nodeRadius(node, settings, emphasized);
    const opacity = nodeOpacity(node, highlighted, dimmed);
    const color = semanticNodeColor(node, theme) || theme.muted;
    const renderNode = color === node.color ? node : { ...node, color };

    bucketNode(fills, renderNode, radius, opacity);

    const accent = emphasized || Boolean(node.focus);
    const stroke = accent ? theme.linkHi : theme.nodeStroke;
    const lineWidth = (Boolean(node.focus) ? 2 : emphasized ? 1.75 : 1) / zoom;
    const dash = nodeOutlinePattern(node, zoom);
    const outlineKey = `${stroke}|${opacity}|${lineWidth}|${dash.join(',')}`;
    let bucket = outlines.get(outlineKey);
    if (!bucket) {
      bucket = { stroke, opacity, lineWidth, dash, nodes: [] };
      outlines.set(outlineKey, bucket);
    }
    bucket.nodes.push({ node, radius });
  }

  for (const bucket of fills.values()) {
    ctx.beginPath();
    for (const { node, radius } of bucket.nodes) {
      appendNodeShape(ctx, node, radius);
    }
    ctx.fillStyle = bucket.fill;
    ctx.globalAlpha = bucket.opacity;
    ctx.fill();
  }

  for (const bucket of outlines.values()) {
    ctx.setLineDash(bucket.dash);
    ctx.beginPath();
    for (const { node, radius } of bucket.nodes) {
      appendNodeShape(ctx, node, radius);
    }
    ctx.strokeStyle = bucket.stroke;
    ctx.lineWidth = bucket.lineWidth;
    ctx.globalAlpha = bucket.opacity;
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Expandability is a structural state, so it gets a distinct dashed orbit
  // rather than another glow competing with hover/selection.
  ctx.setLineDash([3 / zoom, 2.5 / zoom]);
  for (const item of nodes) {
    const { node, highlighted, dimmed } = item;
    if (!node.expandable) continue;

    const id = nodeId(node);
    const radius = nodeRadius(node, settings, id === activeId || id === selectedId);
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + 2 / zoom, 0, TAU);
    ctx.strokeStyle = node.color ?? theme.muted;
    ctx.lineWidth = 1.5 / zoom;
    ctx.globalAlpha = nodeOpacity(node, highlighted, dimmed);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawCycleMarkers(ctx, nodes, theme, settings, zoom, view, totalCycleCount) {
  ctx.save();
  ctx.strokeStyle = theme.text;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.4 / zoom;

  for (const item of cycleMarkerItems(nodes, { view, zoom, totalCycleCount })) {
    const { node, highlighted, dimmed } = item;
    const radius = nodeRadius(node, settings) + 4 / zoom;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, -0.18, Math.PI - 0.38);
    ctx.moveTo(node.x - radius, node.y - 0.18 * radius);
    ctx.arc(node.x, node.y, radius, Math.PI + 0.18, TAU - 0.38);
    ctx.globalAlpha = nodeOpacity(node, highlighted, dimmed) * 0.78;
    ctx.stroke();
  }

  ctx.restore();
}

function screenPoint(node, transform) {
  return {
    x: transform.x + node.x * transform.k,
    y: transform.y + node.y * transform.k,
  };
}

function labelPriority(item) {
  return finiteNumber(item.node.radius, 3) * 10
    + Math.log2(1 + Math.max(0, finiteNumber(item.node.degree, 0)));
}

function appendRoundedRect(ctx, { x, y, width, height, radius }) {
  const right = x + width;
  const bottom = y + height;
  ctx.moveTo(x + radius, y);
  ctx.lineTo(right - radius, y);
  ctx.quadraticCurveTo(right, y, right, y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawOneLabel(
  ctx,
  item,
  theme,
  transform,
  settings,
  size,
  alpha,
  accent = false,
  placement = null,
) {
  const { node } = item;
  const exactText = String(node.label ?? node.id ?? '');
  if (!exactText) return null;

  const point = screenPoint(node, transform);
  const emphasized = item.id === item.activeId || item.id === item.selectedId;
  const fontSize = labelFontSize(settings, emphasized);
  ctx.font = `${emphasized ? '600 ' : ''}${fontSize}px ${LABEL_FONT}`;
  const text = item.displayLabel ?? fitCanvasLabel(
    exactText,
    (candidate) => ctx.measureText(candidate).width,
    canvasLabelMaxWidth(size?.width),
  );
  if (!text) return null;
  const radius = nodeRadius(node, settings, emphasized) * transform.k;
  const resolvedPlacement = placement || fitLabelPlacement(
    labelPlacementCandidates({
      x: point.x,
      y: point.y,
      radius,
      width: ctx.measureText(text).width,
      fontSize,
    })[0],
    size,
  );

  if (emphasized) {
    ctx.beginPath();
    appendRoundedRect(ctx, labelCapsuleGeometry(resolvedPlacement.rect));
    ctx.fillStyle = theme.bg;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.strokeStyle = theme.linkHi;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.34;
    ctx.stroke();
  }

  ctx.globalAlpha = alpha;
  ctx.lineWidth = 3;
  ctx.strokeStyle = theme.bg;
  ctx.textAlign = resolvedPlacement.align;
  ctx.strokeText(text, resolvedPlacement.x, resolvedPlacement.y);
  ctx.fillStyle = accent ? theme.linkHi : theme.text;
  ctx.fillText(text, resolvedPlacement.x, resolvedPlacement.y);
  return resolvedPlacement.rect;
}

function drawLabels(ctx, nodes, theme, settings, transform, size, activeId, selectedId, view) {
  const labelsEnabled = settings?.showLabels !== false;
  const threshold = clamp(finiteNumber(settings?.labelZoom, 0), 0, 1);
  const fade = labelOpacity(transform.k, threshold);
  const fontSize = labelFontSize(settings);
  const forced = [];
  const candidates = [];

  for (const item of nodes) {
    const id = nodeId(item.node);
    const decorated = { ...item, id, activeId, selectedId };
    if (id === activeId || id === selectedId) forced.push(decorated);
    else if (labelsEnabled && fade > 0) candidates.push(decorated);
  }

  if (!forced.length && (!labelsEnabled || fade <= 0)) return;

  ctx.save();
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.font = `${fontSize}px ${LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  const budget = labelBudget(size, transform.k, settings?.labelDensity);
  const landmarkIds = transform.k <= 1.2
    ? new Set(selectLandmarkIds(
      candidates.map(({ node }) => node),
      view,
      landmarkBudget(size),
    ))
    : new Set();
  candidates.sort((a, b) => {
    const landmarkOrder = Number(landmarkIds.has(b.id)) - Number(landmarkIds.has(a.id));
    return landmarkOrder
      || labelPriority(b) - labelPriority(a)
      || a.id.localeCompare(b.id);
  });

  const accepted = [];
  for (const item of candidates.slice(0, budget * 2)) {
    const point = screenPoint(item.node, transform);
    if (point.x < -120 || point.x > size.width + 120 || point.y < -30 || point.y > size.height + 30) {
      continue;
    }

    const exactText = String(item.node.label ?? item.node.id ?? '');
    const text = fitCanvasLabel(
      exactText,
      (candidate) => ctx.measureText(candidate).width,
      canvasLabelMaxWidth(size.width),
    );
    if (!text) continue;
    const radius = nodeRadius(item.node, settings, false) * transform.k;
    const width = ctx.measureText(text).width;
    const placements = labelPlacementCandidates({
      x: point.x,
      y: point.y,
      radius,
      width,
      fontSize,
      gap: 4,
    }).map((placement) => fitLabelPlacement(placement, size));
    const landmark = landmarkIds.has(item.id);
    const placement = chooseLabelPlacement(
      landmark ? placements : placements.slice(0, 1),
      accepted,
      { allowOverlap: landmark && transform.k > 0.75 },
    );
    if (!placement) continue;
    accepted.push(placement.rect);

    const neighborhoodAlpha = item.dimmed ? 0.1 : item.node.external ? 0.58 : 0.9;
    drawOneLabel(
      ctx,
      { ...item, displayLabel: text },
      theme,
      transform,
      settings,
      size,
      fade * neighborhoodAlpha,
      false,
      placement,
    );
    if (accepted.length >= budget) break;
  }

  // Hovered and selected labels are last so they remain legible even when they
  // overlap a lower-priority density-culled label.
  forced.sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId));
  for (const item of forced) {
    drawOneLabel(ctx, item, theme, transform, settings, size, 1, true);
  }

  ctx.restore();
}

/**
 * Create a canvas-only graph painter. Physics and interaction state stay with
 * the caller; this module only turns the current scene into pixels.
 */
export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('createRenderer requires a canvas element');
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D rendering is unavailable');

  let size = { width: 0, height: 0, dpr: 1 };
  const folderHullCache = createFolderHullCache();

  function getSize() {
    return { ...size };
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(0, finiteNumber(bounds.width, 0));
    const height = Math.max(0, finiteNumber(bounds.height, 0));
    const dpr = Math.max(1, finiteNumber(globalThis.devicePixelRatio, 1));
    const backingWidth = Math.max(1, Math.round(width * dpr));
    const backingHeight = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    size = { width, height, dpr };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return getSize();
  }

  function draw(scene = {}) {
    if (!size.width || !size.height) resize();

    const model = scene.model ?? {};
    const nodes = Array.isArray(model.nodes) ? model.nodes : [];
    const rawLinks = Array.isArray(model.links) ? model.links : [];
    const transform = normalizeTransform(scene.transform);
    const suppliedTheme = scene.theme ?? {};
    const theme = {
      bg: suppliedTheme.bg ?? 'transparent',
      text: suppliedTheme.text ?? 'transparent',
      muted: suppliedTheme.muted ?? 'transparent',
      link: suppliedTheme.link ?? 'transparent',
      linkHi: suppliedTheme.linkHi ?? 'transparent',
      nodeStroke: suppliedTheme.nodeStroke ?? 'transparent',
      glow: suppliedTheme.glow ?? 'transparent',
      inbound: suppliedTheme.inbound ?? suppliedTheme.linkHi ?? 'transparent',
      outbound: suppliedTheme.outbound ?? suppliedTheme.linkHi ?? 'transparent',
      bidirectional: suppliedTheme.bidirectional ?? suppliedTheme.linkHi ?? 'transparent',
      focus: suppliedTheme.focus ?? suppliedTheme.text ?? 'transparent',
    };
    const settings = scene.settings ?? {};
    const activeId = scene.activeId == null ? null : String(scene.activeId);
    const selectedId = scene.selectedId == null ? null : String(scene.selectedId);
    const hotspotLayout = scene.layoutId === 'hotspot-landscape';
    const impactLayout = scene.layoutId === 'impact-flow';
    const matrixLayout = scene.layoutId === 'dependency-matrix' && scene.matrix;
    const structureLayout = scene.layoutId === 'structure-tree';
    let nearby = neighborhoodIds(scene.neighborhood);
    const selectedPath = scene.view === 'callgraph'
      ? findLoadedCallPath(model, selectedId)
      : null;
    const pathNodeIds = selectedPath ? new Set(selectedPath.nodeIds) : null;
    const pathLinkKeys = selectedPath ? new Set(selectedPath.linkKeys) : null;

    if (nearby) {
      if (activeId != null) nearby.add(activeId);
      if (selectedId != null) nearby.add(selectedId);
      if (!nearby.size) nearby = null;
    }

    ctx.save();
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = theme.bg ?? 'transparent';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.restore();

    const viewport = graphViewport(size, transform);
    const nodesById = new Map(nodes.map((node) => [nodeId(node), node]));
    const visibleNodes = [];

    for (const node of nodes) {
      if (!hasFinitePosition(node)) continue;
      const id = nodeId(node);
      const emphasized = id === activeId || id === selectedId;
      const radius = nodeRadius(node, settings, emphasized);
      if (!pointInViewport(node, viewport, radius)) continue;

      visibleNodes.push({
        node,
        highlighted: pathNodeIds ? pathNodeIds.has(id) : Boolean(nearby && nearby.has(id)),
        dimmed: pathNodeIds ? !pathNodeIds.has(id) : Boolean(nearby && !nearby.has(id)),
      });
    }

    const visibleLinks = [];
    const curved = Boolean(settings.curvedLinks);
    for (const link of rawLinks) {
      const source = resolveEndpoint(link.source, nodesById);
      const target = resolveEndpoint(link.target, nodesById);
      if (!hasFinitePosition(source) || !hasFinitePosition(target)) continue;
      if (!linkInViewport(source, target, viewport)) continue;

      const sourceId = nodeId(source);
      const targetId = nodeId(target);
      const isNear = !nearby || (nearby.has(sourceId) && nearby.has(targetId));
      const isOnPath = Boolean(pathLinkKeys?.has(callLinkKey(sourceId, targetId)));
      visibleLinks.push({
        ...link,
        source,
        target,
        width: linkWidth(link, settings) + (isOnPath ? 1.5 : 0),
        curved,
        control: curved ? curveControl(source, target) : null,
        highlighted: pathLinkKeys ? isOnPath : Boolean(nearby && isNear),
        dimmed: pathLinkKeys ? !isOnPath : Boolean(nearby && !isNear),
      });
    }

    const folderHulls = hotspotLayout
      ? folderHullCache.get(nodes, { stable: scene.scaleMode === 'cluster-grid' })
      : [];
    const renderedLinks = hotspotLayout
      ? hotspotOverviewLinks(visibleLinks, {
        zoom: transform.k,
        totalLinkCount: rawLinks.length,
      })
      : impactLayout
        ? impactOverviewLinks(visibleLinks, {
          zoom: transform.k,
          totalLinkCount: rawLinks.length,
          focusId: nodes.find((node) => node.relationRole === 'focus')?.id,
        })
        : visibleLinks;
    const renderedNodes = hotspotLayout
      ? hotspotOverviewNodes(visibleNodes, {
        zoom: transform.k,
        totalNodeCount: nodes.length,
      })
      : visibleNodes;

    ctx.save();
    ctx.setTransform(
      size.dpr * transform.k,
      0,
      0,
      size.dpr * transform.k,
      size.dpr * transform.x,
      size.dpr * transform.y,
    );
    if (matrixLayout) {
      drawDependencyMatrix(
        ctx,
        scene.matrix,
        theme,
        transform.k,
        scene.matrixHover,
        scene.matrixSelection,
      );
    } else if (structureLayout) {
      drawStructureTree(ctx, visibleNodes, visibleLinks, theme, transform.k, activeId, selectedId);
    } else {
      if (hotspotLayout) {
        drawFolderHulls(ctx, folderHulls, transform.k);
      } else if (scene.layoutId === 'radial-reach') {
        drawRadialGuides(ctx, nodes, theme, transform.k);
      }
      drawLinks(
        ctx,
        renderedLinks,
        theme,
        settings,
        transform.k,
        transform.k >= ARROW_ZOOM,
      );
      drawGlows(ctx, renderedNodes.map((item) => item.node), theme, settings, transform.k, activeId, selectedId);
      drawNodes(ctx, renderedNodes, theme, settings, transform.k, activeId, selectedId);
      drawCycleMarkers(
        ctx,
        renderedNodes,
        theme,
        settings,
        transform.k,
        scene.view,
        nodes.filter((node) => node.inCycle).length,
      );
    }
    ctx.restore();

    if (matrixLayout) {
      drawDependencyMatrixHeaders(ctx, scene.matrix, theme, transform, size);
    } else if (structureLayout) {
      drawStructureTreeLabels(ctx, visibleNodes, theme, settings, transform, size, activeId, selectedId);
    } else {
      if (hotspotLayout) drawFolderHullLabels(ctx, folderHulls, theme, transform, size);
      drawLabels(
        ctx,
        renderedNodes,
        theme,
        settings,
        transform,
        size,
        activeId,
        selectedId,
        scene.view,
      );
      if (scene.layoutId === 'radial-reach') {
        drawRadialDepthLabels(ctx, nodes, theme, transform, size);
      }
    }

    ctx.globalAlpha = 1;
  }

  resize();
  return { resize, draw, getSize };
}
