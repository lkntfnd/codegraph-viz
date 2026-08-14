import { getGraph, getMeta, getVersion, searchNodes } from './api.js';
import { apply as applyForces, build as buildForces } from './forces.js';
import { build as buildModel, KIND_COLORS } from './graphModel.js';
import { createInteractions } from './interactions.js';
import { createPanel } from './panel.js';
import { createRenderer } from './render.js';
import {
  DEFAULTS,
  SCHEMA,
  SETTINGS_STORAGE_KEY,
  clamp,
  deserialize,
  serialize,
} from './settings.js';
import { apply as applyTheme } from './theme.js';

const d3 = window.d3;
const elements = {
  canvas: document.querySelector('#graph'),
  crumbs: document.querySelector('#crumbs'),
  fieldCount: document.querySelector('#field-count'),
  fieldView: document.querySelector('#field-view'),
  fieldWarning: document.querySelector('#field-warning'),
  fitGraph: document.querySelector('#fit-graph'),
  liveDot: document.querySelector('#live-dot'),
  metaCopy: document.querySelector('#meta-copy'),
  placeholder: document.querySelector('#placeholder'),
  placeholderBody: document.querySelector('#placeholder-body'),
  placeholderTitle: document.querySelector('#placeholder-title'),
  tabs: document.querySelector('#tabs'),
  workspace: document.querySelector('#workspace'),
};

function restoreSettings() {
  try {
    const value = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return value ? deserialize(value) : clamp(DEFAULTS);
  } catch {
    return clamp(DEFAULTS);
  }
}

const state = {
  view: 'architecture',
  prefix: '',
  file: null,
  focus: null,
  mtime: null,
  meta: null,
  rawData: null,
  model: null,
  simulation: null,
  settings: restoreSettings(),
  theme: null,
  transform: d3?.zoomIdentity || { x: 0, y: 0, k: 1 },
  frame: null,
  graphRequest: null,
  requestSequence: 0,
  activeId: null,
  selectedId: null,
  neighborhood: null,
  kinds: [],
  pendingSearchFocus: null,
};

state.theme = applyTheme(state.settings.theme, document.documentElement);
const renderer = createRenderer(elements.canvas);
let searchRequest = null;
let panel = null;
let interactions = null;

function setConnection(mode, content) {
  elements.liveDot.className = `live-dot is-${mode}`;
  elements.metaCopy.replaceChildren(...content);
}

function showPlaceholder(title, body, { error = false } = {}) {
  elements.placeholder.hidden = false;
  elements.placeholder.classList.toggle('is-error', error);
  elements.placeholderTitle.textContent = title;
  elements.placeholderBody.textContent = body;
}

function hidePlaceholder() {
  elements.placeholder.hidden = true;
  elements.placeholder.classList.remove('is-error');
}

function strong(value) {
  const node = document.createElement('strong');
  node.textContent = String(value);
  return node;
}

async function loadMeta() {
  setConnection('loading', [document.createTextNode('Reading index…')]);
  try {
    const meta = await getMeta();
    state.meta = meta;
    if (meta.error) {
      setConnection('error', [document.createTextNode('Schema not detected')]);
      return;
    }
    setConnection('live', [
      strong(Number(meta.nodeCount).toLocaleString()),
      document.createTextNode(' symbols · '),
      strong(Number(meta.edgeCount).toLocaleString()),
      document.createTextNode(' edges'),
    ]);
  } catch {
    setConnection('error', [document.createTextNode('Backend offline')]);
  }
}

const viewLabel = (view) => ({
  architecture: 'Architecture',
  filedeps: 'File dependencies',
  callgraph: 'Call graph',
}[view] || view);

function setActiveTab(view) {
  for (const tab of elements.tabs.querySelectorAll('[data-view]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  }
  elements.fieldView.textContent = viewLabel(view);
}

function addCrumbButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'crumb';
  button.textContent = label;
  button.addEventListener('click', onClick);
  elements.crumbs.append(button);
}

function addCrumbSeparator() {
  const separator = document.createElement('span');
  separator.className = 'crumb-separator';
  separator.textContent = '/';
  elements.crumbs.append(separator);
}

function addScopeText(text, className = 'scope-hint') {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  elements.crumbs.append(node);
}

function renderCrumbs() {
  elements.crumbs.replaceChildren();

  if (state.view === 'callgraph') {
    if (!state.file) {
      addScopeText(state.focus
        ? 'Focused symbol and its call neighborhood'
        : 'Top functions by call degree · open a file from File deps to scope this view');
      return;
    }
    addCrumbButton('‹ File deps', () => {
      state.file = null;
      state.focus = null;
      loadGraphView('filedeps');
    });
    addCrumbSeparator();
    addScopeText(state.file, 'crumb-current');
    addScopeText('· calls and callers in this file');
    return;
  }

  addCrumbButton('root', () => {
    state.prefix = '';
    state.file = null;
    loadGraphView(state.view);
  });

  const parts = state.prefix.split('/').filter(Boolean);
  let accumulated = '';
  for (const part of parts) {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    const target = accumulated;
    addCrumbSeparator();
    addCrumbButton(part, () => {
      state.prefix = target;
      state.file = null;
      loadGraphView(state.view);
    });
  }

  if (state.view === 'filedeps') {
    addScopeText('· files in this scope and their dependencies');
  } else if (!parts.length) {
    addScopeText('· project structure');
  }
}

function filteredData(data) {
  const hiddenKinds = new Set(state.settings.hiddenKinds.map((kind) => kind.toLowerCase()));
  const nodes = data.nodes.filter((node) => {
    if (!state.settings.showExternal && node.external) return false;
    return !hiddenKinds.has(String(node.kind || 'unknown').toLowerCase());
  });
  return { ...data, nodes };
}

function endpointId(endpoint) {
  return typeof endpoint === 'object' && endpoint !== null ? String(endpoint.id) : String(endpoint);
}

function neighborhoodFor(id) {
  if (id == null || !state.model) return null;
  const target = String(id);
  const neighborhood = new Set([target]);
  for (const link of state.model.links) {
    const source = endpointId(link.source);
    const destination = endpointId(link.target);
    if (source === target) neighborhood.add(destination);
    if (destination === target) neighborhood.add(source);
  }
  return neighborhood;
}

function setHover(node) {
  state.activeId = node ? String(node.id) : null;
  const emphasized = state.activeId || state.selectedId;
  state.neighborhood = neighborhoodFor(emphasized);
  draw();
}

function clearSelection() {
  state.selectedId = null;
  state.neighborhood = neighborhoodFor(state.activeId);
  draw();
}

function selectNode(node) {
  const id = String(node.id);
  state.selectedId = state.selectedId === id ? null : id;
  state.neighborhood = neighborhoodFor(state.activeId || state.selectedId);
  draw();
}

function handleNodeClick(node) {
  if (state.view === 'architecture') {
    state.prefix = node.path || node.id;
    state.file = null;
    state.focus = null;
    loadGraphView(node.expandable ? 'architecture' : 'filedeps');
  } else if (state.view === 'filedeps') {
    state.file = node.path || node.id;
    state.focus = null;
    loadGraphView('callgraph');
  } else {
    selectNode(node);
  }
}

function updateFieldCount() {
  if (!state.model) return;
  elements.fieldCount.textContent = `${state.model.nodes.length.toLocaleString()} nodes · ${state.model.links.length.toLocaleString()} links`;
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, serialize(state.settings));
  } catch {
    // Persistence is an enhancement; private browsing or storage denial must
    // not make the graph unusable.
  }
}

const FORCE_SETTINGS = new Set([
  'centerForce',
  'repelForce',
  'linkForce',
  'linkDistance',
  'collidePad',
  'velocityDecay',
  'alphaDecay',
]);

function updateSetting(key, value) {
  state.settings = clamp({ ...state.settings, [key]: value });
  persistSettings();
  panel?.update(state.settings, { kinds: state.kinds });

  if (key === 'theme') {
    state.theme = applyTheme(state.settings.theme, document.documentElement);
    draw();
    return;
  }

  if (key === 'hiddenKinds' || key === 'showExternal') {
    if (state.rawData) {
      replaceSimulation(state.rawData, { preserve: true, fit: false });
      updateFieldCount();
    }
    return;
  }

  if (key === 'animate') {
    if (state.simulation) {
      state.simulation
        .alphaTarget(state.settings.animate ? 0.015 : 0)
        .alpha(Math.max(0.12, state.simulation.alpha()))
        .stop();
      requestFrame();
    }
    return;
  }

  if (FORCE_SETTINGS.has(key) && state.simulation) {
    applyForces(d3, state.simulation, state.settings, { cx: 0, cy: 0 });
    state.simulation
      .alphaTarget(state.settings.animate ? 0.015 : 0)
      .stop();
    requestFrame();
    return;
  }

  draw();
}

function resetSettings() {
  state.settings = clamp(DEFAULTS);
  state.theme = applyTheme(state.settings.theme, document.documentElement);
  persistSettings();
  panel?.update(state.settings, { kinds: state.kinds });
  if (state.rawData) {
    replaceSimulation(state.rawData, { preserve: false, fit: true });
    updateFieldCount();
  } else {
    draw();
  }
}

async function runSearch(query) {
  searchRequest?.abort();
  searchRequest = new AbortController();
  const { results } = await searchNodes(query, { signal: searchRequest.signal });
  return results;
}

async function focusSearchResult(result) {
  state.file = null;
  state.focus = String(result.id);
  state.pendingSearchFocus = state.focus;
  await loadGraphView('callgraph');
}

function carryPositions(previousModel, nextModel) {
  if (!previousModel) return false;
  const positions = new Map(previousModel.nodes.map((node) => [node.id, node]));
  let reused = 0;

  for (const node of nextModel.nodes) {
    const previous = positions.get(node.id);
    if (!previous || !Number.isFinite(previous.x) || !Number.isFinite(previous.y)) continue;
    node.x = previous.x;
    node.y = previous.y;
    node.vx = Number.isFinite(previous.vx) ? previous.vx : 0;
    node.vy = Number.isFinite(previous.vy) ? previous.vy : 0;
    reused += 1;
  }

  // New nodes enter beside an already-positioned neighbor instead of at an
  // unrelated origin. D3 initializes any remaining nodes deterministically.
  const byId = new Map(nextModel.nodes.map((node) => [node.id, node]));
  for (const node of nextModel.nodes) {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) continue;
    const neighbors = [];
    for (const link of nextModel.links) {
      const source = endpointId(link.source);
      const target = endpointId(link.target);
      const neighborId = source === node.id ? target : target === node.id ? source : null;
      const neighbor = neighborId && byId.get(neighborId);
      if (neighbor && Number.isFinite(neighbor.x) && Number.isFinite(neighbor.y)) neighbors.push(neighbor);
    }
    if (neighbors.length) {
      node.x = neighbors.reduce((sum, neighbor) => sum + neighbor.x, 0) / neighbors.length;
      node.y = neighbors.reduce((sum, neighbor) => sum + neighbor.y, 0) / neighbors.length;
    }
  }

  return reused > 0;
}

function draw() {
  renderer.draw({
    model: state.model || { nodes: [], links: [] },
    transform: state.transform,
    theme: state.theme,
    settings: state.settings,
    activeId: state.activeId,
    selectedId: state.selectedId,
    neighborhood: state.neighborhood,
  });
}

function requestFrame() {
  if (state.frame != null) return;
  state.frame = requestAnimationFrame(animationFrame);
}

function animationFrame() {
  state.frame = null;
  const simulation = state.simulation;
  if (!simulation) {
    draw();
    return;
  }

  if (state.settings.animate && simulation.alpha() < 0.025) simulation.alpha(0.04);
  simulation.tick();
  draw();

  if (simulation === state.simulation && (state.settings.animate || simulation.alpha() > simulation.alphaMin())) {
    requestFrame();
  }
}

function fitGraph() {
  const { width, height } = renderer.getSize();
  if (!width || !height) return;
  const padding = Math.min(90, Math.max(36, Math.min(width, height) * 0.1));
  if (interactions) {
    interactions.fit(state.model?.nodes || [], { width, height, padding });
  } else {
    state.transform = d3.zoomIdentity.translate(width / 2, height / 2);
    draw();
  }
}

function replaceSimulation(data, { preserve = false, fit = true } = {}) {
  const previousModel = preserve ? state.model : null;
  const model = buildModel(filteredData(data));
  const reusedPositions = carryPositions(previousModel, model);

  state.simulation?.stop();
  state.model = model;
  const visibleIds = new Set(model.nodes.map((node) => String(node.id)));
  if (state.activeId && !visibleIds.has(state.activeId)) state.activeId = null;
  if (state.selectedId && !visibleIds.has(state.selectedId)) state.selectedId = null;
  state.neighborhood = neighborhoodFor(state.activeId || state.selectedId);
  state.simulation = buildForces(d3, model.nodes, model.links, state.settings, { cx: 0, cy: 0 }).stop();
  state.simulation.alphaTarget(state.settings.animate ? 0.015 : 0);

  const warmupTicks = reusedPositions ? 4 : Math.min(36, 12 + model.nodes.length);
  for (let index = 0; index < warmupTicks; index += 1) state.simulation.tick();
  if (fit) fitGraph();
  requestFrame();
}

function graphOptions() {
  const options = { view: state.view };
  if ((state.view === 'architecture' || state.view === 'filedeps') && state.prefix) {
    options.prefix = state.prefix;
  }
  if (state.view === 'callgraph') {
    if (state.file) options.file = state.file;
    if (state.focus) options.focus = state.focus;
  }
  return options;
}

async function loadGraphView(view = state.view, { preserve = false, fit = true } = {}) {
  const viewChanged = view !== state.view;
  state.view = view;
  if (viewChanged) {
    state.activeId = null;
    state.selectedId = null;
    state.neighborhood = null;
  }
  state.requestSequence += 1;
  const sequence = state.requestSequence;
  state.graphRequest?.abort();
  state.graphRequest = new AbortController();

  setActiveTab(view);
  renderCrumbs();
  elements.fieldCount.textContent = 'Loading graph…';
  if (!state.model) showPlaceholder('Mapping project', 'Reading the local code index and preparing the field.');

  try {
    const data = await getGraph(graphOptions(), { signal: state.graphRequest.signal });
    if (sequence !== state.requestSequence) return;
    if (data.error) {
      state.model = null;
      state.simulation?.stop();
      state.simulation = null;
      showPlaceholder('Schema not detected', 'Open /api/schema to inspect the detected database tables.', { error: true });
      draw();
      return;
    }

    state.rawData = data;
    state.mtime = data.mtime;
    state.kinds = [...new Set(data.nodes.map((node) => String(node.kind || 'unknown')))];
    panel?.update(state.settings, { kinds: state.kinds });
    replaceSimulation(data, { preserve, fit });
    updateFieldCount();
    elements.fieldWarning.hidden = !data.truncated;

    if (state.model.nodes.length) hidePlaceholder();
    else showPlaceholder('Nothing in this scope', 'Choose another view or move back through the breadcrumb trail.');

    if (state.pendingSearchFocus) {
      const targetId = state.pendingSearchFocus;
      state.pendingSearchFocus = null;
      const node = state.model.nodes.find((candidate) => String(candidate.id) === targetId);
      if (node) {
        state.selectedId = targetId;
        state.neighborhood = neighborhoodFor(targetId);
        const size = renderer.getSize();
        interactions?.centerOn(node, {
          ...size,
          scale: Math.max(1.8, interactions.getTransform().k),
        });
        draw();
      }
    }
  } catch (error) {
    if (error?.name === 'AbortError') return;
    showPlaceholder('Graph unavailable', error?.message || 'The graph request failed.', { error: true });
  }
}

async function pollVersion() {
  if (document.hidden) return;
  try {
    const { mtime } = await getVersion();
    if (state.mtime != null && mtime !== state.mtime) {
      await Promise.all([loadMeta(), loadGraphView(state.view, { preserve: true, fit: false })]);
    }
  } catch {
    // The header owns connectivity feedback; transient polling errors should not
    // replace a graph the user can still inspect.
  }
}

if (d3) {
  interactions = createInteractions({
    d3,
    canvas: elements.canvas,
    getModel: () => state.model,
    getSimulation: () => state.simulation,
    getNodeScale: () => state.settings.nodeSize,
    onTransform: (transform) => {
      state.transform = transform;
      draw();
    },
    onHover: setHover,
    onNodeClick: handleNodeClick,
    onBackgroundClick: clearSelection,
    onSimulationChange: (simulation) => {
      simulation?.stop();
      requestFrame();
    },
  });
  state.transform = interactions.getTransform();
}

panel = createPanel({
  root: document.querySelector('#settings-root'),
  schema: SCHEMA,
  settings: state.settings,
  kindColors: KIND_COLORS,
  onChange: updateSetting,
  onReset: resetSettings,
  onSearch: runSearch,
  onSelectSearch: focusSearchResult,
});

elements.tabs.addEventListener('click', (event) => {
  const view = event.target.closest('[data-view]')?.dataset.view;
  if (view) {
    if (view !== 'callgraph') state.focus = null;
    loadGraphView(view);
  }
});

elements.fitGraph.addEventListener('click', fitGraph);
elements.canvas.addEventListener('keydown', (event) => {
  if (event.key === '0' || event.key.toLowerCase() === 'f') {
    event.preventDefault();
    fitGraph();
  } else if (event.key === 'Escape') {
    clearSelection();
  }
});

window.addEventListener('beforeunload', () => {
  state.graphRequest?.abort();
  searchRequest?.abort();
  state.simulation?.stop();
  interactions?.destroy();
});

const resizeObserver = new ResizeObserver(() => {
  if (!renderer.resize()) return;
  if (state.model) fitGraph();
  else draw();
});
resizeObserver.observe(elements.workspace);

async function start() {
  renderer.resize();
  if (!d3) {
    showPlaceholder('Graph engine unavailable', 'The local D3 asset could not be loaded.', { error: true });
    return;
  }
  await Promise.all([loadMeta(), loadGraphView(state.view)]);
  window.setInterval(pollVersion, 3_000);
}

start();
