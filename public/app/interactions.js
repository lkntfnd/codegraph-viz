import { buildNodeSpatialIndex } from './spatialIndex.js';
import { activationFor } from './nodeActivation.js';
import { matrixPositionAt } from './dependencyMatrix.js';

const MIN_SCALE = 0.12;
const OVERVIEW_MIN_SCALE = 0.02;
const MAX_SCALE = 6;
const FIT_MAX_SCALE = 2.5;
const CLICK_DISTANCE = 5;
const DEFAULT_PADDING = 48;
const DRAG_ALPHA_TARGET = 0.3;

const noop = () => {};
const finite = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function boundedFitScale(value, minimum = MIN_SCALE) {
  const floor = clamp(finite(minimum, MIN_SCALE), OVERVIEW_MIN_SCALE, MIN_SCALE);
  return clamp(finite(value, floor), floor, FIT_MAX_SCALE);
}

export function zoomScaleExtent() {
  return [OVERVIEW_MIN_SCALE, MAX_SCALE];
}

function normalizedPadding(value) {
  if (value && typeof value === 'object') {
    return {
      top: Math.max(0, finite(value.top, DEFAULT_PADDING)),
      right: Math.max(0, finite(value.right, DEFAULT_PADDING)),
      bottom: Math.max(0, finite(value.bottom, DEFAULT_PADDING)),
      left: Math.max(0, finite(value.left, DEFAULT_PADDING)),
    };
  }
  const padding = Math.max(0, finite(value, DEFAULT_PADDING));
  return { top: padding, right: padding, bottom: padding, left: padding };
}

export function paddedViewportCenter(width, height, padding = DEFAULT_PADDING) {
  const viewportWidth = Math.max(0, finite(width, 0));
  const viewportHeight = Math.max(0, finite(height, 0));
  const inset = normalizedPadding(padding);
  const availableWidth = Math.max(1, viewportWidth - inset.left - inset.right);
  const availableHeight = Math.max(1, viewportHeight - inset.top - inset.bottom);
  return {
    x: inset.left + availableWidth / 2,
    y: inset.top + availableHeight / 2,
  };
}

/**
 * Attach zoom, pan, hover, click, and force-aware node dragging to a canvas.
 * D3 is injected because the browser loads the vendored UMD bundle globally.
 */
export function createInteractions(options = {}) {
  const {
    d3,
    canvas,
    getModel,
    getSimulation = () => null,
    getMatrix = () => null,
    getNodeScale = () => 1,
    onTransform = noop,
    onHover = noop,
    onNodeClick = noop,
    onNodeDoubleClick = noop,
    onMatrixHover = noop,
    onMatrixClick = noop,
    onBackgroundClick = noop,
    onSimulationChange = noop,
  } = options;

  const missing = ['select', 'zoom', 'drag', 'quadtree']
    .filter((name) => typeof d3?.[name] !== 'function');
  if (!d3?.zoomIdentity) missing.push('zoomIdentity');
  if (missing.length) {
    throw new TypeError(`createInteractions requires d3 with: ${missing.join(', ')}`);
  }
  if (!canvas || typeof canvas.getBoundingClientRect !== 'function' || !canvas.classList) {
    throw new TypeError('createInteractions requires a canvas element');
  }
  if (typeof getModel !== 'function') {
    throw new TypeError('createInteractions requires getModel()');
  }

  const selection = d3.select(canvas);
  let transform = normalizeTransform(
    typeof d3.zoomTransform === 'function' ? d3.zoomTransform(canvas) : d3.zoomIdentity,
  );
  let hoveredNode = null;
  let hoveredMatrixPosition = null;
  let lastPointer = null;
  let draggedNode = null;
  let dragSimulation = null;
  let dragOrigin = null;
  let dragMoved = false;
  let panning = false;
  let panOrigin = null;
  let panTransform = null;
  let panMoved = false;
  let suppressClick = false;
  let suppressClickTimer = null;
  let destroyed = false;
  let nodeIndex = buildNodeSpatialIndex(d3, [], () => 0);
  let nodeIndexDirty = true;

  // d3-zoom stores its transform on the target element. Seed it explicitly so
  // hit-testing and programmatic transforms always share the same value.
  canvas.__zoom = transform;

  function normalizeTransform(value) {
    const k = clamp(finite(value?.k, 1), OVERVIEW_MIN_SCALE, MAX_SCALE);
    const x = finite(value?.x, 0);
    const y = finite(value?.y, 0);
    return d3.zoomIdentity.translate(x, y).scale(k);
  }

  function modelNodes(nodesOrModel) {
    if (Array.isArray(nodesOrModel)) return nodesOrModel;
    if (Array.isArray(nodesOrModel?.nodes)) return nodesOrModel.nodes;

    const model = getModel();
    if (Array.isArray(model)) return model;
    return Array.isArray(model?.nodes) ? model.nodes : [];
  }

  function nodeScale() {
    return Math.max(0.01, finite(getNodeScale(), 1));
  }

  function nodeRadius(node, scale = nodeScale()) {
    return Math.max(0.5, finite(node?.radius, 3)) * scale;
  }

  function nativeSource(event) {
    let source = event;
    while (source?.sourceEvent) source = source.sourceEvent;
    return source;
  }

  function touchFor(source, identifier) {
    const touches = source?.touches?.length ? source.touches : source?.changedTouches;
    if (!touches?.length) return source;

    if (identifier != null) {
      for (const touch of touches) {
        if (touch.identifier === identifier) return touch;
      }
    }
    return touches[0];
  }

  function pointer(event) {
    const source = nativeSource(event);
    const pointerSource = touchFor(source, event?.identifier);

    if (typeof d3.pointer === 'function') {
      const point = d3.pointer(pointerSource, canvas);
      if (Number.isFinite(point?.[0]) && Number.isFinite(point?.[1])) return point;
    }

    if (Number.isFinite(pointerSource?.offsetX) && Number.isFinite(pointerSource?.offsetY)) {
      return [pointerSource.offsetX, pointerSource.offsetY];
    }

    const bounds = canvas.getBoundingClientRect();
    const clientX = finite(pointerSource?.clientX, finite(event?.x, 0) + bounds.left);
    const clientY = finite(pointerSource?.clientY, finite(event?.y, 0) + bounds.top);
    return [
      clientX - bounds.left - finite(canvas.clientLeft, 0),
      clientY - bounds.top - finite(canvas.clientTop, 0),
    ];
  }

  function graphPoint(screenPoint) {
    if (typeof transform.invert === 'function') return transform.invert(screenPoint);
    return [
      (screenPoint[0] - transform.x) / transform.k,
      (screenPoint[1] - transform.y) / transform.k,
    ];
  }

  function nodeAt(screenPoint) {
    if (!screenPoint) return null;
    if (nodeIndexDirty) updateNodeIndex();
    const [x, y] = graphPoint(screenPoint);
    return nodeIndex.find(x, y);
  }

  function matrixAt(screenPoint) {
    if (!screenPoint) return null;
    const matrix = getMatrix();
    if (!matrix) return null;
    const [x, y] = graphPoint(screenPoint);
    return matrixPositionAt(matrix, x, y);
  }

  function updateNodeIndex(nodes) {
    const scale = nodeScale();
    nodeIndex = buildNodeSpatialIndex(
      d3,
      modelNodes(nodes),
      (node) => nodeRadius(node, scale),
    );
    nodeIndexDirty = false;
    return nodeIndex.size;
  }

  function invalidateNodeIndex() {
    nodeIndexDirty = true;
  }

  function updateCursorClasses() {
    const moving = Boolean(draggedNode || panning);
    canvas.classList.toggle('is-dragging', moving);
    const actionable = Boolean(hoveredNode || hoveredMatrixPosition?.cell);
    canvas.classList.toggle('is-pannable', !moving && !actionable);
    canvas.classList.toggle('is-node-hover', !moving && actionable);
  }

  function setHovered(node, event) {
    if (node === hoveredNode) return;
    hoveredNode = node;
    updateCursorClasses();
    onHover(node, event);
  }

  function setHoveredMatrix(position, event) {
    const same = position?.sourceIndex === hoveredMatrixPosition?.sourceIndex
      && position?.targetIndex === hoveredMatrixPosition?.targetIndex;
    if (same) return;
    hoveredMatrixPosition = position;
    updateCursorClasses();
    onMatrixHover(position, event);
  }

  function updateHover(screenPoint, event) {
    if (draggedNode || panning) return;
    const matrixPosition = matrixAt(screenPoint);
    setHovered(matrixPosition ? null : nodeAt(screenPoint), event);
    setHoveredMatrix(matrixPosition, event);
  }

  function notifySimulation(simulation) {
    onSimulationChange(simulation);
  }

  function scheduleClickSuppression() {
    suppressClick = true;
    if (suppressClickTimer != null) globalThis.clearTimeout(suppressClickTimer);
    // The synthetic click follows mouseup in the current task. Keeping the flag
    // through that task suppresses the drill without eating the next real click
    // if d3 already stopped the synthetic event in capture phase.
    suppressClickTimer = globalThis.setTimeout(() => {
      suppressClick = false;
      suppressClickTimer = null;
    }, 0);
  }

  function isPrimaryGesture(event) {
    if (event?.type === 'wheel') return true;
    if (event?.ctrlKey) return false;
    return event?.button == null || event.button === 0;
  }

  function zoomFilter(event) {
    if (destroyed || !isPrimaryGesture(event)) return false;
    if (event.type === 'wheel') return true;
    const screenPoint = pointer(event);
    return !nodeAt(screenPoint) && !matrixAt(screenPoint)?.cell;
  }

  function dragFilter(event) {
    return !destroyed
      && isPrimaryGesture(event)
      && Boolean(getSimulation())
      && Boolean(nodeAt(pointer(event)));
  }

  function gentleWheelDelta(event) {
    const unit = event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002;
    return -finite(event.deltaY, 0) * unit * 0.2 * (event.ctrlKey ? 10 : 1);
  }

  function handleZoomStart(event) {
    const source = nativeSource(event);
    if (!source || source.type === 'wheel' || source.type === 'dblclick') return;

    panning = true;
    panOrigin = pointer(event);
    panTransform = transform;
    panMoved = false;
    setHovered(null, event);
    updateCursorClasses();
  }

  function handleZoom(event) {
    transform = normalizeTransform(event.transform);
    canvas.__zoom = transform;

    if (panning && panTransform) {
      const shift = Math.hypot(transform.x - panTransform.x, transform.y - panTransform.y);
      panMoved ||= shift >= CLICK_DISTANCE;
    }

    onTransform(transform, event);

    const source = nativeSource(event);
    if (!panning && source?.type === 'wheel') {
      lastPointer = pointer(event);
      updateHover(lastPointer, event);
    }
  }

  function handleZoomEnd(event) {
    if (panning && panMoved) scheduleClickSuppression();
    panning = false;
    panOrigin = null;
    panTransform = null;
    panMoved = false;
    updateCursorClasses();

    const source = nativeSource(event);
    if (source && source.type !== 'wheel') lastPointer = pointer(event);
    if (lastPointer) updateHover(lastPointer, event);
  }

  const zoomBehavior = d3.zoom()
    .scaleExtent(zoomScaleExtent())
    .clickDistance(CLICK_DISTANCE)
    .wheelDelta(gentleWheelDelta)
    .filter(zoomFilter)
    .on('start.interactions', handleZoomStart)
    .on('zoom.interactions', handleZoom)
    .on('end.interactions', handleZoomEnd);

  function handleDragStart(event) {
    const node = event.subject;
    const screenPoint = pointer(event);
    const position = graphPoint(screenPoint);

    draggedNode = node;
    dragOrigin = screenPoint;
    dragMoved = false;
    dragSimulation = getSimulation();
    node.fx = Number.isFinite(node.x) ? node.x : position[0];
    node.fy = Number.isFinite(node.y) ? node.y : position[1];

    if (dragSimulation) {
      dragSimulation.alphaTarget(DRAG_ALPHA_TARGET).restart();
      notifySimulation(dragSimulation);
    }

    setHovered(node, event);
    updateCursorClasses();
    try {
      canvas.focus({ preventScroll: true });
    } catch {
      canvas.focus?.();
    }
  }

  function handleDrag(event) {
    const screenPoint = pointer(event);
    const [x, y] = graphPoint(screenPoint);
    const node = event.subject;

    node.fx = x;
    node.fy = y;
    if (dragOrigin) {
      dragMoved ||= Math.hypot(
        screenPoint[0] - dragOrigin[0],
        screenPoint[1] - dragOrigin[1],
      ) >= CLICK_DISTANCE;
    }

    if (dragSimulation) {
      dragSimulation.alphaTarget(DRAG_ALPHA_TARGET);
      notifySimulation(dragSimulation);
    }
  }

  function handleDragEnd(event) {
    const node = event.subject;
    const simulation = dragSimulation || getSimulation();
    node.fx = null;
    node.fy = null;

    if (simulation) {
      if (!event.active) simulation.alphaTarget(0);
      notifySimulation(simulation);
    }
    if (dragMoved) scheduleClickSuppression();

    draggedNode = null;
    dragSimulation = null;
    dragOrigin = null;
    dragMoved = false;
    lastPointer = pointer(event);
    updateCursorClasses();
    updateHover(lastPointer, event);
  }

  const dragBehavior = d3.drag()
    .container(() => canvas)
    .clickDistance(CLICK_DISTANCE)
    .filter(dragFilter)
    .subject((event) => nodeAt(pointer(event)))
    .on('start.interactions', handleDragStart)
    .on('drag.interactions', handleDrag)
    .on('end.interactions', handleDragEnd);

  function handlePointerMove(event) {
    lastPointer = pointer(event);
    updateHover(lastPointer, event);
  }

  function handlePointerLeave(event) {
    lastPointer = null;
    if (!draggedNode && !panning) {
      setHovered(null, event);
      setHoveredMatrix(null, event);
    }
  }

  function handleClick(event) {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }

    const screenPoint = pointer(event);
    lastPointer = screenPoint;
    const matrixPosition = matrixAt(screenPoint);
    if (matrixPosition?.cell) {
      onMatrixClick(matrixPosition, event);
      return;
    }
    const node = nodeAt(screenPoint);
    const activation = activationFor(event, Boolean(node));
    if (activation === 'select') onNodeClick(node, event);
    else if (activation === 'background') onBackgroundClick(event);
  }

  function handleDoubleClick(event) {
    const screenPoint = pointer(event);
    lastPointer = screenPoint;
    if (matrixAt(screenPoint)) return;
    const node = nodeAt(screenPoint);
    if (activationFor(event, Boolean(node)) !== 'drill') return;
    event.preventDefault();
    event.stopPropagation();
    onNodeDoubleClick(node, event);
  }

  selection
    .call(zoomBehavior)
    .on('dblclick.zoom', null)
    .call(dragBehavior)
    .on('pointermove.interactions', handlePointerMove)
    .on('pointerleave.interactions', handlePointerLeave)
    .on('click.interactions', handleClick)
    .on('dblclick.interactions', handleDoubleClick);
  updateCursorClasses();

  function getTransform() {
    return transform;
  }

  function setTransform(nextTransform) {
    const next = normalizeTransform(nextTransform);
    if (destroyed) {
      transform = next;
      return transform;
    }
    selection.call(zoomBehavior.transform, next);
    return transform;
  }

  function viewportDimensions(dimensions = {}) {
    const bounds = canvas.getBoundingClientRect();
    return {
      width: Math.max(0, finite(dimensions.width, finite(bounds.width, canvas.clientWidth || 0))),
      height: Math.max(0, finite(dimensions.height, finite(bounds.height, canvas.clientHeight || 0))),
    };
  }

  function fitPadding(value) {
    return normalizedPadding(value);
  }

  function fit(nodes, dimensions = {}) {
    const { width, height } = viewportDimensions(dimensions);
    if (!width || !height) return transform;

    const positioned = modelNodes(nodes).filter(
      (node) => Number.isFinite(node?.x) && Number.isFinite(node?.y),
    );
    if (!positioned.length) {
      return setTransform(d3.zoomIdentity.translate(width / 2, height / 2));
    }

    const scale = nodeScale();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of positioned) {
      const box = node.territory;
      const hasTerritory = box && [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite);
      if (hasTerritory) {
        minX = Math.min(minX, box.x0);
        maxX = Math.max(maxX, box.x1);
        minY = Math.min(minY, box.y0);
        maxY = Math.max(maxY, box.y1);
      } else {
        const radius = nodeRadius(node, scale);
        minX = Math.min(minX, node.x - radius);
        maxX = Math.max(maxX, node.x + radius);
        minY = Math.min(minY, node.y - radius);
        maxY = Math.max(maxY, node.y + radius);
      }
    }

    const padding = fitPadding(dimensions.padding);
    const availableWidth = Math.max(1, width - padding.left - padding.right);
    const availableHeight = Math.max(1, height - padding.top - padding.bottom);
    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    const k = boundedFitScale(
      Math.min(availableWidth / graphWidth, availableHeight / graphHeight),
      dimensions.minScale,
    );
    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;
    const viewportCenterX = padding.left + availableWidth / 2;
    const viewportCenterY = padding.top + availableHeight / 2;

    return setTransform(d3.zoomIdentity
      .translate(viewportCenterX - graphCenterX * k, viewportCenterY - graphCenterY * k)
      .scale(k));
  }

  function centerOn(node, dimensions = {}) {
    if (!Number.isFinite(node?.x) || !Number.isFinite(node?.y)) return transform;
    const { width, height } = viewportDimensions(dimensions);
    if (!width || !height) return transform;

    const k = clamp(finite(dimensions.scale, transform.k), MIN_SCALE, MAX_SCALE);
    const center = paddedViewportCenter(width, height, dimensions.padding);
    return setTransform(d3.zoomIdentity
      .translate(center.x - node.x * k, center.y - node.y * k)
      .scale(k));
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;

    selection
      .on('.zoom', null)
      .on('.drag', null)
      .on('.interactions', null);

    if (draggedNode) {
      draggedNode.fx = null;
      draggedNode.fy = null;
      if (dragSimulation) {
        dragSimulation.alphaTarget(0);
        notifySimulation(dragSimulation);
      }
    }
    if (suppressClickTimer != null) globalThis.clearTimeout(suppressClickTimer);

    hoveredNode = null;
    hoveredMatrixPosition = null;
    lastPointer = null;
    draggedNode = null;
    dragSimulation = null;
    panning = false;
    suppressClick = false;
    suppressClickTimer = null;
    canvas.classList.remove('is-pannable', 'is-dragging', 'is-node-hover');
  }

  return {
    getTransform,
    setTransform,
    fit,
    centerOn,
    updateNodeIndex,
    invalidateNodeIndex,
    destroy,
  };
}
