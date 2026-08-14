const TAU = Math.PI * 2;
const LABEL_FONT = 'ui-monospace, "SF Mono", Menlo, monospace';
const ARROW_ZOOM = 1.65;
const LABEL_FADE_RANGE = 0.65;
const VIEWPORT_MARGIN = 48;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function nodeId(node) {
  if (node && typeof node === 'object') return String(node.id);
  return String(node);
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

function drawLinkBuckets(ctx, buckets, color, zoom) {
  for (const bucket of buckets.values()) {
    ctx.beginPath();
    for (const link of bucket.links) appendLinkPath(ctx, link, bucket.curved);
    ctx.strokeStyle = color;
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

function drawArrowBuckets(ctx, buckets, color, settings, zoom) {
  for (const bucket of buckets.values()) {
    ctx.beginPath();
    for (const link of bucket.links) appendArrow(ctx, link, settings, zoom);
    ctx.fillStyle = color;
    ctx.globalAlpha = bucket.alpha;
    ctx.fill();
  }
}

function bucketLink(map, link, highlighted, dimmed, curved) {
  const width = Math.round(link.width * 4) / 4;
  const alpha = highlighted ? 0.9 : dimmed ? 0.11 : 1;
  const key = `${width}|${alpha}|${curved ? 1 : 0}`;
  let bucket = map.get(key);

  if (!bucket) {
    bucket = { width, alpha, curved, links: [] };
    map.set(key, bucket);
  }
  bucket.links.push(link);
}

function drawLinks(ctx, links, theme, settings, zoom, showArrows) {
  const idle = new Map();
  const highlighted = new Map();

  for (const link of links) {
    bucketLink(
      link.highlighted ? highlighted : idle,
      link,
      link.highlighted,
      link.dimmed,
      link.curved,
    );
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawLinkBuckets(ctx, idle, theme.link, zoom);
  drawLinkBuckets(ctx, highlighted, theme.linkHi, zoom);

  // Direction markers are intentionally zoom-gated: at overview scale they
  // create more visual noise than information.
  if (showArrows) {
    drawArrowBuckets(ctx, idle, theme.link, settings, zoom);
    drawArrowBuckets(ctx, highlighted, theme.linkHi, settings, zoom);
  }
}

function nodeOpacity(node, highlighted, dimmed) {
  if (dimmed) return 0.1;
  if (node.external) return highlighted ? 0.72 : 0.48;
  return highlighted ? 1 : 0.92;
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

function drawNodes(ctx, nodes, theme, settings, zoom, activeId, selectedId) {
  const fills = new Map();
  const outlines = new Map();

  for (const item of nodes) {
    const { node, highlighted, dimmed } = item;
    const id = nodeId(node);
    const emphasized = id === activeId || id === selectedId;
    const radius = nodeRadius(node, settings, emphasized);
    const opacity = nodeOpacity(node, highlighted, dimmed);
    const renderNode = node.color ? node : { ...node, color: theme.muted };

    bucketNode(fills, renderNode, radius, opacity);

    const accent = emphasized || Boolean(node.focus);
    const stroke = accent ? theme.linkHi : theme.nodeStroke;
    const lineWidth = (Boolean(node.focus) ? 2 : emphasized ? 1.75 : 1) / zoom;
    const outlineKey = `${stroke}|${opacity}|${lineWidth}`;
    let bucket = outlines.get(outlineKey);
    if (!bucket) {
      bucket = { stroke, opacity, lineWidth, nodes: [] };
      outlines.set(outlineKey, bucket);
    }
    bucket.nodes.push({ node, radius });
  }

  for (const bucket of fills.values()) {
    ctx.beginPath();
    for (const { node, radius } of bucket.nodes) {
      ctx.moveTo(node.x + radius, node.y);
      ctx.arc(node.x, node.y, radius, 0, TAU);
    }
    ctx.fillStyle = bucket.fill;
    ctx.globalAlpha = bucket.opacity;
    ctx.fill();
  }

  for (const bucket of outlines.values()) {
    ctx.beginPath();
    for (const { node, radius } of bucket.nodes) {
      ctx.moveTo(node.x + radius, node.y);
      ctx.arc(node.x, node.y, radius, 0, TAU);
    }
    ctx.strokeStyle = bucket.stroke;
    ctx.lineWidth = bucket.lineWidth;
    ctx.globalAlpha = bucket.opacity;
    ctx.stroke();
  }

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

function rectanglesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function drawOneLabel(ctx, item, theme, transform, settings, alpha, accent = false) {
  const { node } = item;
  const text = String(node.label ?? node.id ?? '');
  if (!text) return null;

  const point = screenPoint(node, transform);
  const emphasized = item.id === item.activeId || item.id === item.selectedId;
  const radius = nodeRadius(node, settings, emphasized) * transform.k;
  const y = point.y + radius + 5;
  const metrics = ctx.measureText(text);
  const width = metrics.width;
  const rect = {
    left: point.x - width / 2 - 3,
    right: point.x + width / 2 + 3,
    top: y - 1,
    bottom: y + 14,
  };

  ctx.globalAlpha = alpha;
  ctx.lineWidth = 3;
  ctx.strokeStyle = theme.bg;
  ctx.strokeText(text, point.x, y);
  ctx.fillStyle = accent ? theme.linkHi : theme.text;
  ctx.fillText(text, point.x, y);
  return rect;
}

function drawLabels(ctx, nodes, theme, settings, transform, size, activeId, selectedId) {
  const labelsEnabled = settings?.showLabels !== false;
  const threshold = Math.max(0, finiteNumber(settings?.labelZoom, 1.2));
  const fade = clamp((transform.k - threshold) / LABEL_FADE_RANGE, 0, 1);
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
  ctx.font = `11px ${LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  const budget = clamp(
    Math.floor((size.width * size.height) / 9500 * clamp(transform.k, 1, 2.25)),
    24,
    220,
  );
  candidates.sort((a, b) => labelPriority(b) - labelPriority(a));

  const accepted = [];
  for (const item of candidates.slice(0, budget * 2)) {
    const point = screenPoint(item.node, transform);
    if (point.x < -120 || point.x > size.width + 120 || point.y < -30 || point.y > size.height + 30) {
      continue;
    }

    const text = String(item.node.label ?? item.node.id ?? '');
    if (!text) continue;
    const radius = nodeRadius(item.node, settings, false) * transform.k;
    const width = ctx.measureText(text).width;
    const top = point.y + radius + 4;
    const rect = {
      left: point.x - width / 2 - 3,
      right: point.x + width / 2 + 3,
      top,
      bottom: top + 15,
    };

    if (accepted.some((other) => rectanglesOverlap(rect, other))) continue;
    accepted.push(rect);

    const neighborhoodAlpha = item.dimmed ? 0.1 : item.node.external ? 0.58 : 0.9;
    drawOneLabel(ctx, item, theme, transform, settings, fade * neighborhoodAlpha);
    if (accepted.length >= budget) break;
  }

  // Hovered and selected labels are last so they remain legible even when they
  // overlap a lower-priority density-culled label.
  forced.sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId));
  for (const item of forced) {
    drawOneLabel(ctx, item, theme, transform, settings, 1, true);
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
    };
    const settings = scene.settings ?? {};
    const activeId = scene.activeId == null ? null : String(scene.activeId);
    const selectedId = scene.selectedId == null ? null : String(scene.selectedId);
    let nearby = neighborhoodIds(scene.neighborhood);

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
        highlighted: Boolean(nearby && nearby.has(id)),
        dimmed: Boolean(nearby && !nearby.has(id)),
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
      visibleLinks.push({
        ...link,
        source,
        target,
        width: linkWidth(link, settings),
        curved,
        control: curved ? curveControl(source, target) : null,
        highlighted: Boolean(nearby && isNear),
        dimmed: Boolean(nearby && !isNear),
      });
    }

    ctx.save();
    ctx.setTransform(
      size.dpr * transform.k,
      0,
      0,
      size.dpr * transform.k,
      size.dpr * transform.x,
      size.dpr * transform.y,
    );
    drawLinks(
      ctx,
      visibleLinks,
      theme,
      settings,
      transform.k,
      transform.k >= ARROW_ZOOM,
    );
    drawGlows(ctx, visibleNodes.map((item) => item.node), theme, settings, transform.k, activeId, selectedId);
    drawNodes(ctx, visibleNodes, theme, settings, transform.k, activeId, selectedId);
    ctx.restore();

    drawLabels(
      ctx,
      visibleNodes,
      theme,
      settings,
      transform,
      size,
      activeId,
      selectedId,
    );

    ctx.globalAlpha = 1;
  }

  resize();
  return { resize, draw, getSize };
}
