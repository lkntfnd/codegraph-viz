// public/app/main.js — coordinate graph data, layouts, rendering, and interface state.

import { getGraph, getMeta, getVersion, searchNodes } from './api.js';
import { graphReadyAnnouncement, selectionClearedAnnouncement } from './accessibility.js';
import { createCanvasTransition } from './canvasTransition.js';
import { findLoadedCallPath } from './callPath.js';
import {
  buildCallCyclePresentation,
  CALL_CYCLE_SUMMARY_THRESHOLD,
} from './callCycleProjection.js';
import { callPresentationScope } from './callPresentationCopy.js';
import { copyText } from './clipboard.js';
import { filterGraphByCodeSets, summarizeCodeSets } from './codeSet.js';
import { filterSelectedFileDirection, normalizeFileDirection } from './fileDirection.js';
import { cycleMemberWindow } from './cyclePresentation.js';
import { describeMatrixPosition, formatRelationBreakdown, matrixEntityFocus } from './dependencyMatrix.js';
import { browseGraphEntities } from './entityBrowser.js';
import {
  filterFileDependencyEvidence,
  normalizeFileEvidence,
  normalizeMinimumCouplingPercentile,
} from './fileEvidence.js';
import { build as buildModel, couplingLegend, KIND_COLORS } from './graphModel.js';
import { formatGraphCount } from './graphCount.js';
import { directionalNodeId } from './graphKeyboard.js';
import {
  DEFAULT_CALL_DEPTH,
  DEFAULT_CALL_DIRECTION,
  buildGraphOptions,
  normalizeCallDepth,
  normalizeCallDirection,
} from './graphQuery.js';
import { applyCachedPositions, createGraphCache } from './graphCache.js';
import {
  cycleEvidenceCopy,
  describeCallCycleSummary,
  describeImpactReach,
  describeSelection,
} from './inspector.js';
import { createInteractions } from './interactions.js';
import { createLayoutCameraStore, layoutCameraScope } from './layoutCamera.js';
import {
  createForceLayoutController,
  createNodesLayoutController,
  createDependencyMatrixLayoutController,
  createHotspotLayoutController,
  createImpactFlowLayoutController,
  createRadialReachLayoutController,
  createStructureTreeLayoutController,
} from './layoutController.js';
import {
  defaultLayoutId,
  hasLayoutChoice,
  layoutActivityLabel,
  layoutDescription,
  layoutOptions,
  layoutUsesPhysics,
  normalizeLayoutId,
} from './layoutRegistry.js';
import { createModeStateStore } from './modeState.js';
import { pendingSelectionCameraAction } from './nodeActivation.js';
import { createLoadingTransaction } from './loadingTransaction.js';
import { createPanel } from './panel.js';
import { createPerspectiveStore } from './perspectives.js';
import { createPlaceholderActionSlot } from './placeholderAction.js';
import { graphFilterSummary } from './querySummary.js';
import { createRecentSymbolStore, rememberRecentSymbol } from './recentSymbols.js';
import { searchIndexAfterKey } from './searchNavigation.js';
import { truncationLabel, truncationMessage } from './scopeStatus.js';
import {
  filterEdgesByMinimumWeight,
  filterEdgesByRelations,
  relationKindSummary,
} from './relationFilter.js';
import {
  createRenderer,
  CYCLE_OVERVIEW_MARKER_LIMIT,
  HOTSPOT_OVERVIEW_LINK_LIMIT,
} from './render.js';
import { createStructureCollapseStore, projectStructureTreeModel } from './structureTree.js';
import { tickWithinBudget } from './simulationScheduler.js';
import {
  DEFAULTS,
  SCHEMA,
  SETTINGS_STORAGE_KEY,
  clamp,
  deserialize,
  serialize,
} from './settings.js';
import { apply as applyTheme } from './theme.js';
import { tabIndexAfterKey } from './tabNavigation.js';
import {
  investigationUrl,
  normalizeMinimumRelationWeight,
  parseGraphHash,
  serializeGraphHash,
} from './urlState.js';
import { cameraAfterViewportResize } from './viewport.js';

const d3 = window.d3;
const WARMUP_BUDGET_MS = 8;
const initialUrlState = parseGraphHash(window.location.hash);
const restoredSettings = restoreSettings();
const initialSettings = clamp({
  ...restoredSettings,
  hiddenKinds: initialUrlState.hiddenKinds,
  hiddenCodeSets: initialUrlState.hiddenCodeSets,
  ...(['filedeps', 'callgraph'].includes(initialUrlState.view)
    ? { showExternal: initialUrlState.showExternal }
    : {}),
  ...(initialUrlState.view === 'filedeps'
    ? { hiddenRelationKinds: initialUrlState.hiddenRelationKinds }
    : {}),
});
const elements = {
  canvas: document.querySelector('#graph'),
  canvasTransition: document.querySelector('#graph-transition'),
  crumbs: document.querySelector('#crumbs'),
  couplingScale: document.querySelector('#coupling-scale'),
  couplingScaleItems: [...document.querySelectorAll('[data-coupling-percentile]')],
  copyInvestigation: document.querySelector('#copy-investigation'),
  cycleKeySymbol: document.querySelector('#filedeps-key .cycle-key-symbol'),
  fieldCount: document.querySelector('#field-count'),
  fieldView: document.querySelector('#field-view'),
  fieldWarning: document.querySelector('#field-warning'),
  filterReadout: document.querySelector('#filter-readout'),
  filterReadoutCopy: document.querySelector('#filter-readout-copy'),
  clearFilters: document.querySelector('#clear-filters'),
  perspectivesDialog: document.querySelector('#perspectives-dialog'),
  openPerspectives: document.querySelector('#open-perspectives'),
  closePerspectives: document.querySelector('#close-perspectives'),
  perspectiveSaveForm: document.querySelector('#perspective-save-form'),
  perspectiveName: document.querySelector('#perspective-name'),
  perspectiveStatus: document.querySelector('#perspective-status'),
  perspectiveEmpty: document.querySelector('#perspective-empty'),
  perspectiveList: document.querySelector('#perspective-list'),
  perspectiveImport: document.querySelector('#perspective-import'),
  perspectiveImportJson: document.querySelector('#perspective-import-json'),
  importPerspective: document.querySelector('#import-perspective'),
  entitiesDialog: document.querySelector('#entities-dialog'),
  openEntities: document.querySelector('#open-entities'),
  closeEntities: document.querySelector('#close-entities'),
  entityQuery: document.querySelector('#entity-query'),
  entitiesStatus: document.querySelector('#entities-status'),
  entitiesList: document.querySelector('#entities-list'),
  graphStatus: document.querySelector('#graph-status'),
  graphToolbar: document.querySelector('.graph-toolbar'),
  filedepsKey: document.querySelector('#filedeps-key'),
  filedepsKeyLabel: document.querySelector('#filedeps-key-label'),
  fitGraph: document.querySelector('#fit-graph'),
  inspector: document.querySelector('#selection-inspector'),
  inspectorCenter: document.querySelector('#inspector-center'),
  inspectorCopyName: document.querySelector('#inspector-copy-name'),
  inspectorCopyPath: document.querySelector('#inspector-copy-path'),
  inspectorActionStatus: document.querySelector('#inspector-action-status'),
  inspectorClose: document.querySelector('#inspector-close'),
  inspectorCoupling: document.querySelector('#inspector-coupling'),
  inspectorCouplingPercentile: document.querySelector('#inspector-coupling-percentile'),
  inspectorCouplingTotal: document.querySelector('#inspector-coupling-total'),
  inspectorCycle: document.querySelector('#inspector-cycle'),
  inspectorCycleDescription: document.querySelector('#inspector-cycle-description'),
  inspectorCycleMembers: document.querySelector('#inspector-cycle-members'),
  inspectorCycleNote: document.querySelector('#inspector-cycle-note'),
  inspectorCycleSize: document.querySelector('#inspector-cycle-size'),
  inspectorCycleTitle: document.querySelector('#inspector-cycle-title'),
  inspectorCycleToggle: document.querySelector('#inspector-cycle-toggle'),
  inspectorDisclosure: document.querySelector('#inspector-disclosure'),
  inspectorMatrix: document.querySelector('#inspector-matrix'),
  inspectorMatrixKinds: document.querySelector('#inspector-matrix-kinds'),
  inspectorMatrixSource: document.querySelector('#inspector-matrix-source'),
  inspectorMatrixTarget: document.querySelector('#inspector-matrix-target'),
  inspectorMatrixWeight: document.querySelector('#inspector-matrix-weight'),
  inspectorExternal: document.querySelector('#inspector-external'),
  inspectorHierarchy: document.querySelector('#inspector-hierarchy'),
  inspectorHierarchyChildren: document.querySelector('#inspector-hierarchy-children'),
  inspectorHierarchyDepth: document.querySelector('#inspector-hierarchy-depth'),
  inspectorHierarchyMix: document.querySelector('#inspector-hierarchy-mix'),
  inspectorHierarchyParent: document.querySelector('#inspector-hierarchy-parent'),
  inspectorHierarchyRoot: document.querySelector('#inspector-hierarchy-root'),
  inspectorHierarchySymbols: document.querySelector('#inspector-hierarchy-symbols'),
  inspectorInbound: document.querySelector('#inspector-inbound'),
  inspectorInboundCount: document.querySelector('#inspector-inbound-count'),
  inspectorKind: document.querySelector('#inspector-kind'),
  inspectorImpact: document.querySelector('#inspector-impact'),
  inspectorCallerTotal: document.querySelector('#inspector-caller-total'),
  inspectorCallerDirect: document.querySelector('#inspector-caller-direct'),
  inspectorCallerTransitive: document.querySelector('#inspector-caller-transitive'),
  inspectorCallerFiles: document.querySelector('#inspector-caller-files'),
  inspectorCalleeTotal: document.querySelector('#inspector-callee-total'),
  inspectorCalleeDirect: document.querySelector('#inspector-callee-direct'),
  inspectorCalleeTransitive: document.querySelector('#inspector-callee-transitive'),
  inspectorCalleeFiles: document.querySelector('#inspector-callee-files'),
  inspectorOutbound: document.querySelector('#inspector-outbound'),
  inspectorOutboundCount: document.querySelector('#inspector-outbound-count'),
  inspectorPath: document.querySelector('#inspector-path'),
  inspectorTitle: document.querySelector('#inspector-title'),
  inspectorWeightedInbound: document.querySelector('#inspector-weighted-inbound'),
  inspectorWeightedOutbound: document.querySelector('#inspector-weighted-outbound'),
  impactKey: document.querySelector('#impact-key'),
  impactKeyInbound: document.querySelector('#impact-key .is-inbound'),
  impactKeyFocus: document.querySelector('#impact-key .impact-key-focus'),
  impactKeyOutbound: document.querySelector('#impact-key .is-outbound'),
  impactKeyScope: document.querySelector('#impact-key .impact-key-scope'),
  layoutControl: document.querySelector('#layout-control'),
  layoutDescription: document.querySelector('#layout-description'),
  layoutLabel: document.querySelector('#layout-label'),
  layoutSelect: document.querySelector('#layout-select'),
  liveDot: document.querySelector('#live-dot'),
  loadingBody: document.querySelector('#loading-body'),
  loadingTitle: document.querySelector('#loading-title'),
  loadingVeil: document.querySelector('#loading-veil'),
  metaCopy: document.querySelector('#meta-copy'),
  placeholder: document.querySelector('#placeholder'),
  placeholderAction: document.querySelector('#placeholder-action'),
  placeholderBody: document.querySelector('#placeholder-body'),
  placeholderTitle: document.querySelector('#placeholder-title'),
  tabs: document.querySelector('#tabs'),
  toolbarStatus: document.querySelector('#toolbar-status'),
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
  view: initialUrlState.view,
  prefix: initialUrlState.prefix,
  file: initialUrlState.file,
  focus: initialUrlState.focus,
  callDepth: initialUrlState.callDepth,
  callDirection: initialUrlState.callDirection,
  layoutId: initialUrlState.layoutId,
  mtime: null,
  meta: null,
  rawData: null,
  loadedGraphOptions: null,
  model: null,
  presentedModel: null,
  callCyclePresentation: null,
  callCycleExpandedIds: new Set(),
  callCycleExpandedScope: null,
  layout: null,
  warmup: null,
  settings: initialSettings,
  theme: null,
  transform: d3?.zoomIdentity || { x: 0, y: 0, k: 1 },
  frame: null,
  graphRequest: null,
  requestSequence: 0,
  activeId: null,
  selectedId: ['filedeps', 'callgraph'].includes(initialUrlState.view)
    ? initialUrlState.selectedId ?? initialUrlState.focus
    : initialUrlState.focus,
  neighborhood: null,
  kinds: [],
  relations: [],
  hiddenRelationKinds: [...initialSettings.hiddenRelationKinds],
  minRelationWeight: initialUrlState.view === 'filedeps' ? initialUrlState.minRelationWeight : 1,
  fileEvidence: initialUrlState.view === 'filedeps' ? initialUrlState.fileEvidence : 'all',
  minCouplingPercentile: initialUrlState.view === 'filedeps'
    ? initialUrlState.minCouplingPercentile
    : 0,
  fileDirection: initialUrlState.view === 'filedeps'
    ? initialUrlState.fileDirection
    : 'both',
  pendingSearchFocus: initialUrlState.view === 'callgraph'
    ? initialUrlState.selectedId ?? initialUrlState.focus
    : initialUrlState.focus,
  recentSymbols: [],
  matrixHover: null,
  matrixSelection: null,
  matrixEntityFocus: null,
  cycleExpanded: false,
};

state.theme = applyTheme(state.settings.theme, document.documentElement);
const renderer = createRenderer(elements.canvas);
const frameTransition = createCanvasTransition({
  source: elements.canvas,
  overlay: elements.canvasTransition,
  reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});
const modeStates = createModeStateStore();
const graphCache = createGraphCache();
const layoutCameras = createLayoutCameraStore();
const placeholderAction = createPlaceholderActionSlot();
const structureCollapse = createStructureCollapseStore();
const recentSymbolStore = createRecentSymbolStore(localStorage);
const perspectiveStore = createPerspectiveStore(localStorage);
let searchRequest = null;
let inspectorStatusTimer = null;
let toolbarStatusTimer = null;
let renderedInspectorId = null;
let activeEntityIndex = -1;
let panel = null;
let interactions = null;

const graphLoading = createLoadingTransaction({
  show(copy) {
    elements.loadingTitle.textContent = copy.title;
    elements.loadingBody.textContent = copy.body;
    elements.loadingVeil.hidden = false;
    elements.workspace.setAttribute('aria-busy', 'true');
  },
  hide() {
    elements.loadingVeil.hidden = true;
    elements.workspace.removeAttribute('aria-busy');
  },
});

const layoutLoading = createLoadingTransaction({
  show(copy) {
    elements.layoutLabel.textContent = 'Arranging…';
    elements.layoutSelect.disabled = true;
    elements.layoutSelect.setAttribute('aria-label', copy.ariaLabel);
    elements.layoutControl.classList.add('is-arranging');
    if (window.matchMedia('(max-width: 760px)').matches) {
      const selectedOption = elements.layoutSelect.selectedOptions[0];
      if (selectedOption) {
        selectedOption.textContent = 'Arranging…';
        elements.layoutSelect.dataset.activityOption = 'true';
      }
    }
  },
  hide() {
    elements.layoutLabel.textContent = 'Layout';
    elements.layoutSelect.disabled = false;
    elements.layoutSelect.setAttribute('aria-label', 'Graph layout');
    elements.layoutControl.classList.remove('is-arranging');
    if (elements.layoutSelect.dataset.activityOption === 'true') {
      delete elements.layoutSelect.dataset.activityOption;
      syncLayoutControl();
    }
  },
});

function loadingCopy(view, layoutId) {
  if (view === 'architecture' && layoutId === 'structure-tree') {
    return {
      title: 'Building structure tree',
      body: 'Reading the complete containment hierarchy.',
    };
  }
  if (view === 'architecture') {
    return { title: 'Mapping architecture', body: 'Preparing directory territories.' };
  }
  if (view === 'filedeps') {
    return { title: 'Tracing dependencies', body: 'Preparing file relations and coupling evidence.' };
  }
  return { title: 'Tracing call impact', body: 'Preparing callers, callees, and reachable files.' };
}

function setConnection(mode, content) {
  elements.liveDot.className = `live-dot is-${mode}`;
  elements.metaCopy.replaceChildren(...content);
}

function showPlaceholder(title, body, {
  error = false,
  actionLabel = null,
  onAction = null,
  dismissOnAction = false,
} = {}) {
  elements.placeholder.hidden = false;
  elements.placeholder.classList.toggle('is-error', error);
  elements.placeholderTitle.textContent = title;
  elements.placeholderBody.textContent = body;
  elements.placeholderAction.hidden = !actionLabel;
  elements.placeholderAction.textContent = actionLabel || '';
  placeholderAction.set(onAction, { dismiss: dismissOnAction });
}

function hidePlaceholder() {
  elements.placeholder.hidden = true;
  elements.placeholder.classList.remove('is-error');
  elements.placeholderAction.hidden = true;
  placeholderAction.clear();
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
    state.recentSymbols = recentSymbolStore.load(meta.mtime);
    refreshPanel();
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

function saveLayoutCamera(layoutId = state.layoutId) {
  layoutCameras.save(
    state.view,
    layoutId,
    layoutCameraScope(state),
    state.transform,
  );
}

function saveCurrentGraphPositions() {
  if (!state.loadedGraphOptions || !state.model || !state.layout) return;
  graphCache.savePositions(
    state.loadedGraphOptions,
    state.layout.id,
    (state.presentedModel || state.model).nodes,
  );
}

function restoreLayoutCamera(layoutId) {
  const camera = layoutCameras.restore(
    state.view,
    layoutId,
    layoutCameraScope(state),
  );
  if (camera) {
    state.transform = d3.zoomIdentity.translate(camera.x, camera.y).scale(camera.k);
  }
  return camera;
}

function saveCurrentModeState() {
  saveLayoutCamera();
  modeStates.save(state.view, {
    prefix: state.prefix,
    file: state.file,
    focus: state.focus,
    callDepth: state.callDepth,
    callDirection: state.callDirection,
    layoutId: state.layoutId,
    selectedId: state.selectedId,
    hiddenKinds: state.settings.hiddenKinds,
    hiddenCodeSets: state.settings.hiddenCodeSets,
    hiddenRelationKinds: state.hiddenRelationKinds,
    expandedCallCycleIds: [...state.callCycleExpandedIds],
    minRelationWeight: state.minRelationWeight,
    fileEvidence: state.fileEvidence,
    minCouplingPercentile: state.minCouplingPercentile,
    fileDirection: state.fileDirection,
    showExternal: state.settings.showExternal,
    transform: state.transform,
  });
}

function restoreModeState(view) {
  const snapshot = modeStates.restore(view);
  if (!snapshot) return false;

  state.prefix = snapshot.prefix;
  state.file = snapshot.file;
  state.focus = snapshot.focus;
  state.callDepth = normalizeCallDepth(snapshot.callDepth);
  state.callDirection = normalizeCallDirection(snapshot.callDirection);
  state.layoutId = normalizeLayoutId(view, snapshot.layoutId);
  state.selectedId = snapshot.selectedId;
  state.hiddenRelationKinds = [...snapshot.hiddenRelationKinds];
  state.minRelationWeight = normalizeMinimumRelationWeight(snapshot.minRelationWeight);
  state.fileEvidence = normalizeFileEvidence(snapshot.fileEvidence);
  state.minCouplingPercentile = normalizeMinimumCouplingPercentile(snapshot.minCouplingPercentile);
  state.fileDirection = normalizeFileDirection(snapshot.fileDirection);
  state.callCycleExpandedIds = new Set(snapshot.expandedCallCycleIds);
  state.callCycleExpandedScope = view === 'callgraph'
    ? `${state.focus ?? ''}|${state.callDepth}|${state.callDirection}`
    : null;
  state.settings = clamp({
    ...state.settings,
    hiddenKinds: snapshot.hiddenKinds,
    hiddenCodeSets: snapshot.hiddenCodeSets,
    hiddenRelationKinds: state.hiddenRelationKinds,
    showExternal: snapshot.showExternal,
  });
  state.transform = d3.zoomIdentity
    .translate(snapshot.transform.x, snapshot.transform.y)
    .scale(snapshot.transform.k);
  elements.inspector.hidden = true;
  return true;
}

function switchMode(view) {
  if (!view || view === state.view) return;
  saveCurrentModeState();
  const restored = restoreModeState(view);
  if (!restored) {
    state.prefix = '';
    state.file = null;
    state.focus = null;
    state.callDepth = DEFAULT_CALL_DEPTH;
    state.callDirection = DEFAULT_CALL_DIRECTION;
    state.layoutId = defaultLayoutId(view);
    state.selectedId = null;
    state.callCycleExpandedIds.clear();
    state.callCycleExpandedScope = null;
    if (view === 'filedeps') {
      state.minRelationWeight = 1;
      state.fileEvidence = 'all';
      state.minCouplingPercentile = 0;
      state.fileDirection = 'both';
    }
  }
  loadGraphView(view, {
    fit: !restored,
    preserveSelection: restored,
  });
}

function setActiveTab(view) {
  for (const tab of elements.tabs.querySelectorAll('[data-view]')) {
    const selected = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  elements.fieldView.textContent = viewLabel(view);
  updateFilterReadout();
  syncLayoutControl();
}

function syncUrlState() {
  const hash = serializeGraphHash(state);
  if (window.location.hash === hash) return;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
}

function syncLayoutControl() {
  const options = layoutOptions(state.view);
  elements.layoutControl.hidden = !hasLayoutChoice(state.view);
  elements.layoutSelect.replaceChildren(...options.map(({ id, label }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    return option;
  }));
  state.layoutId = normalizeLayoutId(state.view, state.layoutId);
  elements.layoutSelect.value = state.layoutId;
  const description = layoutDescription(state.view, state.layoutId);
  elements.layoutDescription.textContent = description;
  elements.layoutDescription.title = description;
  elements.layoutSelect.setAttribute('aria-describedby', 'layout-description');
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
        : 'Select a symbol to trace callers and callees');
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
  const codeSetVisible = filterGraphByCodeSets(data, state.settings.hiddenCodeSets);
  const hiddenKinds = new Set(state.settings.hiddenKinds.map((kind) => kind.toLowerCase()));
  const nodes = codeSetVisible.nodes.filter((node) => {
    if (!state.settings.showExternal && node.external) return false;
    return !hiddenKinds.has(String(node.kind || 'unknown').toLowerCase());
  });
  const relationEdges = state.view === 'filedeps'
    ? filterEdgesByRelations(codeSetVisible.edges, state.hiddenRelationKinds)
    : codeSetVisible.edges;
  const edges = state.view === 'filedeps'
    ? filterEdgesByMinimumWeight(relationEdges, state.minRelationWeight)
    : relationEdges;
  const visible = { ...codeSetVisible, nodes, edges };
  const directional = state.view === 'filedeps'
    ? filterSelectedFileDirection(visible, state.selectedId, state.fileDirection)
    : visible;
  return state.view === 'filedeps'
    ? filterFileDependencyEvidence(directional, state.fileEvidence, {
      minimumCouplingPercentile: state.minCouplingPercentile,
    })
    : visible;
}

function syncPresentedModel() {
  state.presentedModel = state.layout?.id === 'structure-tree'
    ? projectStructureTreeModel(state.model, state.layout.tree.visibleNodeIds)
    : state.view === 'callgraph' && state.callCyclePresentation
      ? state.callCyclePresentation.model
      : state.model;
  return state.presentedModel;
}

function neighborhoodFor(id) {
  const model = state.presentedModel || state.model;
  if (id == null || !model) return null;
  const target = String(id);
  return new Set([target, ...(model.indexes?.neighborsById.get(target) || [])]);
}

function setHover(node) {
  state.activeId = node ? String(node.id) : null;
  const emphasized = state.activeId || state.selectedId;
  state.neighborhood = neighborhoodFor(emphasized);
  draw();
}

function setMatrixHover(position) {
  state.matrixHover = position;
  draw();
}

function renderRelationList(root, relations) {
  root.replaceChildren();
  if (!relations.length) {
    const empty = document.createElement('li');
    empty.className = 'inspector-relation-empty';
    empty.textContent = 'None in this scope';
    root.append(empty);
    return;
  }

  for (const relation of relations) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const label = document.createElement('span');
    const meta = document.createElement('span');
    button.type = 'button';
    button.dataset.nodeId = relation.nodeId;
    label.className = 'inspector-relation-label';
    label.textContent = relation.label;
    meta.className = 'inspector-relation-meta';
    meta.textContent = [relation.relation || relation.kind, relation.weight > 1 ? `×${relation.weight}` : null]
      .filter(Boolean)
      .join(' · ');
    button.append(label, meta);
    item.append(button);
    root.append(item);
  }
}

function renderCycleMembers(root, members) {
  root.replaceChildren();
  for (const member of members) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.nodeId = member.nodeId;
    button.textContent = member.label;
    item.append(button);
    root.append(item);
  }
}

function selectionDetails(id = state.selectedId) {
  return describeCallCycleSummary(state.presentedModel, state.model, id)
    || describeSelection(state.model, id);
}

function renderInspector() {
  const details = selectionDetails();
  const nextInspectorId = details ? String(state.selectedId) : null;
  const selectionChanged = nextInspectorId !== renderedInspectorId;
  renderedInspectorId = nextInspectorId;
  elements.inspector.hidden = !details;
  if (!details) return;
  if (selectionChanged) state.cycleExpanded = false;

  elements.inspectorTitle.textContent = details.label;
  elements.inspectorPath.textContent = details.path || 'No indexed path';
  elements.inspectorPath.classList.toggle('is-missing', !details.path);
  elements.inspectorKind.textContent = details.kind;
  elements.inspectorCopyPath.disabled = !details.path;
  elements.inspectorActionStatus.textContent = '';
  elements.inspectorExternal.hidden = !details.external;
  const selectedNode = state.presentedModel?.indexes?.nodesById.get(String(state.selectedId))
    || state.model?.indexes?.nodesById.get(String(state.selectedId));
  const fullSelectedNode = state.model?.indexes?.nodesById.get(String(state.selectedId));
  const selectedComponent = selectedNode?.cycleSummary
    ? state.model?.indexes?.componentsById.get(String(selectedNode.loadedComponentId))
    : fullSelectedNode
      ? state.model?.indexes?.componentByNodeId.get(String(fullSelectedNode.id))
      : null;
  const largeCallCycle = state.view === 'callgraph'
    && selectedComponent?.cyclic
    && selectedComponent.members.length > CALL_CYCLE_SUMMARY_THRESHOLD;
  const collapsedCallCycle = largeCallCycle && state.callCyclePresentation?.collapsedComponents
    .some((component) => component.id === selectedComponent.id);
  const showStructureDisclosure = state.layout?.id === 'structure-tree' && selectedNode?.treeHasChildren;
  const showDisclosure = showStructureDisclosure || largeCallCycle;
  elements.inspectorDisclosure.hidden = !showDisclosure;
  if (showStructureDisclosure) {
    elements.inspectorDisclosure.textContent = selectedNode.treeCollapsed
      ? 'Expand subtree'
      : 'Collapse subtree';
    elements.inspectorDisclosure.setAttribute('aria-expanded', String(!selectedNode.treeCollapsed));
  } else if (largeCallCycle) {
    elements.inspectorDisclosure.textContent = collapsedCallCycle
      ? `Expand ${selectedComponent.members.length.toLocaleString()} loaded cycle symbols`
      : `Collapse ${selectedComponent.members.length.toLocaleString()} loaded cycle symbols`;
    elements.inspectorDisclosure.setAttribute('aria-expanded', String(!collapsedCallCycle));
  } else {
    elements.inspectorDisclosure.removeAttribute('aria-expanded');
  }
  elements.inspectorInboundCount.textContent = details.inbound.length.toLocaleString();
  elements.inspectorOutboundCount.textContent = details.outbound.length.toLocaleString();
  const showHierarchy = state.layout?.id === 'structure-tree' && details.hierarchy != null;
  elements.inspectorHierarchy.hidden = !showHierarchy;
  if (showHierarchy) {
    const hierarchy = details.hierarchy;
    elements.inspectorHierarchyDepth.textContent = hierarchy.depth.toLocaleString();
    elements.inspectorHierarchyChildren.textContent = hierarchy.directChildren.toLocaleString();
    elements.inspectorHierarchySymbols.textContent = hierarchy.symbolCount.toLocaleString();
    elements.inspectorHierarchyMix.textContent = `${hierarchy.folderChildren.toLocaleString()} ${hierarchy.folderChildren === 1 ? 'folder' : 'folders'} · ${hierarchy.fileChildren.toLocaleString()} ${hierarchy.fileChildren === 1 ? 'file' : 'files'}`;
    elements.inspectorHierarchyParent.hidden = hierarchy.parentId == null;
    elements.inspectorHierarchyRoot.hidden = hierarchy.parentId != null;
    if (hierarchy.parentId != null) {
      elements.inspectorHierarchyParent.textContent = hierarchy.parentLabel;
      elements.inspectorHierarchyParent.dataset.nodeId = hierarchy.parentId;
    } else {
      delete elements.inspectorHierarchyParent.dataset.nodeId;
    }
  }
  elements.inspectorCoupling.hidden = state.view !== 'filedeps';
  elements.inspectorWeightedInbound.textContent = details.coupling.weightedInbound.toLocaleString();
  elements.inspectorWeightedOutbound.textContent = details.coupling.weightedOutbound.toLocaleString();
  elements.inspectorCouplingTotal.textContent = details.coupling.total.toLocaleString();
  elements.inspectorCouplingPercentile.textContent = details.coupling.percentile.toLocaleString();
  const showCycle = ['filedeps', 'callgraph'].includes(state.view) && details.cycle != null;
  elements.inspectorCycle.hidden = !showCycle;
  elements.inspectorCycleSize.textContent = (details.cycle?.size ?? 0).toLocaleString();
  const cycleCopy = cycleEvidenceCopy(state.view, details.cycle?.size);
  elements.inspectorCycleTitle.textContent = cycleCopy.title;
  elements.inspectorCycleDescription.textContent = cycleCopy.description.replace(/^\d+\s*/, '');
  elements.inspectorCycleNote.textContent = cycleCopy.caveat;
  elements.inspectorCycle.setAttribute('aria-label', cycleCopy.ariaLabel);
  const cycleWindow = cycleMemberWindow(details.cycle?.members ?? [], state.selectedId, {
    expanded: state.cycleExpanded,
  });
  renderCycleMembers(elements.inspectorCycleMembers, cycleWindow.members);
  elements.inspectorCycleToggle.hidden = !showCycle || !cycleWindow.canToggle;
  elements.inspectorCycleToggle.textContent = state.cycleExpanded
    ? 'Show less'
    : `Show ${cycleWindow.hiddenCount.toLocaleString()} more`;
  elements.inspectorCycleToggle.setAttribute('aria-expanded', String(state.cycleExpanded));
  const matrixDetails = state.layoutId === 'dependency-matrix'
    ? describeMatrixPosition(state.matrixSelection)
    : null;
  elements.inspectorMatrix.hidden = !matrixDetails;
  if (matrixDetails) {
    elements.inspectorMatrixSource.textContent = matrixDetails.sourceLabel;
    elements.inspectorMatrixSource.dataset.nodeId = matrixDetails.sourceId;
    elements.inspectorMatrixTarget.textContent = matrixDetails.targetLabel;
    elements.inspectorMatrixTarget.dataset.nodeId = matrixDetails.targetId;
    elements.inspectorMatrixWeight.textContent = matrixDetails.weight.toLocaleString();
    elements.inspectorMatrixKinds.textContent = formatRelationBreakdown(matrixDetails.relations);
  }
  const impact = state.view === 'callgraph'
    ? describeImpactReach(state.model, state.selectedId)
    : null;
  elements.inspectorImpact.hidden = !impact;
  if (impact) {
    elements.inspectorCallerTotal.textContent = impact.callers.total.toLocaleString();
    elements.inspectorCallerDirect.textContent = impact.callers.direct.toLocaleString();
    elements.inspectorCallerTransitive.textContent = impact.callers.transitive.toLocaleString();
    elements.inspectorCallerFiles.textContent = impact.callers.fileCount.toLocaleString();
    elements.inspectorCalleeTotal.textContent = impact.callees.total.toLocaleString();
    elements.inspectorCalleeDirect.textContent = impact.callees.direct.toLocaleString();
    elements.inspectorCalleeTransitive.textContent = impact.callees.transitive.toLocaleString();
    elements.inspectorCalleeFiles.textContent = impact.callees.fileCount.toLocaleString();
  }
  renderRelationList(elements.inspectorInbound, details.inbound);
  renderRelationList(elements.inspectorOutbound, details.outbound);
  if (selectionChanged) elements.inspector.scrollTop = 0;
}

async function copyInspectorField(field) {
  const details = selectionDetails();
  const value = field === 'path' ? details?.path : details?.label;
  if (!value) return;
  window.clearTimeout(inspectorStatusTimer);
  try {
    await copyText(value);
    elements.inspectorActionStatus.textContent = field === 'path' ? 'Path copied' : 'Name copied';
  } catch {
    elements.inspectorActionStatus.textContent = 'Clipboard unavailable';
  }
  inspectorStatusTimer = window.setTimeout(() => {
    elements.inspectorActionStatus.textContent = '';
  }, 1_800);
}

function refreshDirectionalSelection() {
  if (state.view !== 'filedeps' || state.fileDirection === 'both' || !state.rawData) return false;
  if (!state.selectedId) state.fileDirection = 'both';
  syncUrlState();
  refreshPanel();
  void (async () => {
    await replaceSimulation(state.rawData, { preserve: false, fit: true });
    updateFieldCount();
    renderInspector();
  })();
  return true;
}

function refreshCallCyclePresentation() {
  if (state.view !== 'callgraph' || !state.rawData || !state.callCyclePresentation) return false;
  refreshPanel();
  void (async () => {
    await replaceSimulation(state.rawData, { preserve: true, fit: true });
    interactions?.invalidateNodeIndex();
    interactions?.updateNodeIndex();
    updateFieldCount();
    renderInspector();
  })();
  return true;
}

function clearSelection() {
  state.selectedId = null;
  state.matrixSelection = null;
  state.matrixEntityFocus = null;
  state.neighborhood = neighborhoodFor(state.activeId);
  syncUrlState();
  refreshPanel();
  if (refreshDirectionalSelection()) return;
  if (refreshCallCyclePresentation()) return;
  renderInspector();
  draw();
}

function clearSelectionAndReturnFocus() {
  clearSelection();
  elements.graphStatus.textContent = selectionClearedAnnouncement();
  elements.canvas.focus();
}

function selectNode(node) {
  const id = String(node.id);
  state.selectedId = state.selectedId === id ? null : id;
  state.matrixSelection = null;
  state.matrixEntityFocus = null;
  state.neighborhood = neighborhoodFor(state.activeId || state.selectedId);
  syncUrlState();
  refreshPanel();
  if (refreshDirectionalSelection()) return;
  if (refreshCallCyclePresentation()) return;
  renderInspector();
  draw();
}

function matrixFocusFor(id, currentScale = interactions?.getTransform().k ?? state.transform.k) {
  if (state.layoutId !== 'dependency-matrix') return null;
  return matrixEntityFocus(state.layout?.matrix, id, { currentScale });
}

function selectionCenterOptions(scale) {
  const size = renderer.getSize();
  const padding = { top: 48, right: 48, bottom: 48, left: 48 };
  if (!elements.inspector.hidden) {
    const canvasRect = elements.canvas.getBoundingClientRect();
    const inspectorRect = elements.inspector.getBoundingClientRect();
    const inspectorIsBottomSheet = inspectorRect.width >= canvasRect.width * 0.8;
    if (inspectorIsBottomSheet) {
      const toolbarRect = elements.graphToolbar?.getBoundingClientRect();
      const settingsRect = document.querySelector('.settings-toggle')?.getBoundingClientRect();
      const obstructionTop = [inspectorRect, toolbarRect, settingsRect]
        .filter((rect) => rect && rect.width > 0 && rect.height > 0)
        .map((rect) => rect.top)
        .reduce((top, value) => Math.min(top, value), inspectorRect.top);
      padding.bottom = Math.max(48, canvasRect.bottom - obstructionTop + 16);
    } else {
      padding.right = Math.max(48, canvasRect.right - inspectorRect.left + 16);
    }
  }
  return { ...size, scale, padding };
}

function selectNodeByKeyboard(node) {
  const id = String(node.id);
  state.selectedId = id;
  state.matrixSelection = null;
  const matrixFocus = matrixFocusFor(id);
  state.matrixEntityFocus = matrixFocus?.position ?? null;
  state.neighborhood = neighborhoodFor(id);
  syncUrlState();
  const details = selectionDetails(id);
  elements.graphStatus.textContent = details
    ? `${details.label}, ${details.kind}. ${details.inbound.length} inbound, ${details.outbound.length} outbound.`
    : `Selected ${id}.`;
  refreshPanel();
  if (refreshDirectionalSelection()) return;
  if (refreshCallCyclePresentation()) return;
  renderInspector();
  if (fitSelectedCallPath(id)) return;
  if (interactions) {
    interactions.centerOn(
      node,
      selectionCenterOptions(matrixFocus?.scale ?? interactions.getTransform().k),
    );
    return;
  }
  draw();
}

function handleNodeClick(node) {
  selectNode(node);
}

function handleNodeDoubleClick(node) {
  if (state.view === 'callgraph' && node.cycleSummary) {
    toggleCallCycleDisclosure();
    return;
  }
  if (state.view === 'architecture') {
    if (state.layout?.id === 'structure-tree' && node.treeHasChildren) {
      toggleStructureDisclosure(node);
      return;
    }
    state.prefix = node.path || node.id;
    state.file = null;
    state.focus = null;
    loadGraphView(node.expandable ? 'architecture' : 'filedeps');
  } else if (state.view === 'filedeps') {
    state.file = node.path || node.id;
    state.focus = null;
    loadGraphView('callgraph');
  } else {
    state.file = null;
    state.focus = String(node.id);
    state.pendingSearchFocus = state.focus;
    loadGraphView('callgraph');
  }
}

function toggleCallCycleDisclosure() {
  if (state.view !== 'callgraph' || !state.callCyclePresentation) return;
  const presentedNode = state.presentedModel?.indexes?.nodesById.get(String(state.selectedId));
  const fullNode = state.model?.indexes?.nodesById.get(String(state.selectedId));
  const componentId = presentedNode?.cycleSummary
    ? String(presentedNode.loadedComponentId)
    : state.model?.indexes?.componentByNodeId.get(String(fullNode?.id))?.id;
  const component = componentId == null ? null : state.model?.indexes?.componentsById.get(componentId);
  if (!component || component.members.length <= CALL_CYCLE_SUMMARY_THRESHOLD) return;
  const collapsed = state.callCyclePresentation.collapsedComponents
    .some((candidate) => candidate.id === componentId);
  if (collapsed) state.callCycleExpandedIds.add(componentId);
  else state.callCycleExpandedIds.delete(componentId);
  state.selectedId = state.focus;
  state.activeId = null;
  state.neighborhood = null;
  syncUrlState();
  elements.graphStatus.textContent = collapsed
    ? `Expanded ${component.members.length.toLocaleString()} loaded cycle symbols.`
    : `Collapsed ${component.members.length.toLocaleString()} loaded cycle symbols.`;
  refreshCallCyclePresentation();
}

function toggleStructureDisclosure(node) {
  if (state.layout?.id !== 'structure-tree' || !node?.treeHasChildren) return;
  const id = String(node.id);
  const expanding = state.layout.tree.collapsedIds.has(id);
  const collapsedIds = structureCollapse.toggle(state.prefix, id);
  state.layout.dispose();
  state.layout = createStructureTreeLayoutController(state.model, {
    collapsedIds,
  });
  structureCollapse.save(state.prefix, state.layout.tree.collapsedIds);
  syncPresentedModel();
  state.activeId = null;
  state.selectedId = id;
  state.neighborhood = neighborhoodFor(id);
  interactions?.invalidateNodeIndex();
  interactions?.updateNodeIndex();
  renderInspector();
  updateFieldCount();
  if (expanding || state.presentedModel.nodes.length <= 3) fitGraph();
  else draw();
}

function handleMatrixClick(position) {
  if (!position?.cell) return;
  state.matrixSelection = position;
  state.matrixEntityFocus = null;
  state.selectedId = position.sourceId;
  state.neighborhood = new Set([position.sourceId, position.targetId]);
  refreshPanel();
  if (refreshDirectionalSelection()) return;
  renderInspector();
  draw();
}

function updateFieldCount() {
  if (!state.model) return;
  const presented = state.presentedModel || state.model;
  const collapsed = presented.nodes.length !== state.model.nodes.length;
  elements.fieldCount.textContent = formatGraphCount({
    visibleNodes: presented.nodes.length,
    totalNodes: state.model.nodes.length,
    visibleLinks: presented.links.length,
    collapsed,
  });
}

function updateFiledepsKey() {
  const count = state.view === 'filedeps'
    ? (state.model?.nodes ?? []).filter((node) => node.inCycle).length
    : 0;
  const filedeps = state.view === 'filedeps' && Boolean(state.model?.nodes.length);
  elements.filedepsKey.hidden = !filedeps;
  const matrix = state.layoutId === 'dependency-matrix';
  elements.cycleKeySymbol.hidden = count === 0;
  if (matrix) {
    elements.filedepsKeyLabel.textContent = count
      ? `Rows → columns · Cell: dependency weight · ${count.toLocaleString()} cyclic ${count === 1 ? 'file' : 'files'}`
      : 'Rows → columns · Cell: dependency weight';
    elements.couplingScale.hidden = true;
    elements.filedepsKey.setAttribute(
      'aria-label',
      'Rows are dependency sources, columns are dependency targets, and cell intensity represents aggregate dependency weight',
    );
    return;
  }
  const overviewReduced = state.model.links.length > HOTSPOT_OVERVIEW_LINK_LIMIT * 2;
  const cycleMarkersReduced = count > CYCLE_OVERVIEW_MARKER_LIMIT;
  const keyParts = ['Size: weighted coupling', 'Hull: folder'];
  if (overviewReduced) keyParts.push(`${HOTSPOT_OVERVIEW_LINK_LIMIT} strongest links at overview`);
  if (count) {
    keyParts.push(`${count.toLocaleString()} cyclic ${count === 1 ? 'file' : 'files'}`);
    if (cycleMarkersReduced) keyParts.push('cycle rings on select or zoom');
  }
  elements.filedepsKeyLabel.textContent = keyParts.join(' · ');
  const legend = filedeps ? couplingLegend(state.model.nodes) : [];
  elements.couplingScale.hidden = legend.length === 0;
  for (const entry of legend) {
    const item = elements.couplingScaleItems.find(
      (candidate) => Number(candidate.dataset.couplingPercentile) === entry.percentile,
    );
    if (!item) continue;
    const diameter = Math.max(8, Math.min(18, entry.radius * 2));
    item.querySelector('i').style.width = `${diameter}px`;
    item.querySelector('i').style.height = `${diameter}px`;
    item.querySelector('strong').textContent = entry.value.toLocaleString();
    item.setAttribute('aria-label', `${entry.percentile}th scope percentile: coupling ${entry.value.toLocaleString()}`);
  }
  elements.filedepsKey.setAttribute(
    'aria-label',
    [
      'Node size represents weighted coupling; labeled hulls group top-level folders',
      overviewReduced
        ? `fitted overviews show the ${HOTSPOT_OVERVIEW_LINK_LIMIT} strongest links; select a file or zoom for complete local relationship evidence`
        : null,
      count
        ? cycleMarkersReduced
          ? `${count.toLocaleString()} cyclic files are loaded; cycle rings appear with selected local evidence or after zooming`
          : `broken rings mark ${count.toLocaleString()} cyclic ${count === 1 ? 'file' : 'files'}`
        : 'no dependency cycles detected in the loaded scope',
    ].filter(Boolean).join('; '),
  );
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, serialize(state.settings));
  } catch {
    // Persistence is an enhancement; private browsing or storage denial must
    // not make the graph unusable.
  }
}

function panelContext(kinds = state.kinds) {
  return {
    kinds,
    codeSets: summarizeCodeSets(state.rawData?.nodes),
    relations: state.relations,
    minRelationWeight: state.minRelationWeight,
    maxRelationWeight: state.view === 'filedeps' && state.rawData
      ? Math.max(
        state.minRelationWeight,
        ...filterEdgesByRelations(state.rawData.edges, state.hiddenRelationKinds)
          .map((edge) => Number(edge.weight) || 1),
      )
      : 1,
    fileEvidence: state.fileEvidence,
    fileDirection: state.fileDirection,
    selectedId: state.selectedId,
    minCouplingPercentile: state.minCouplingPercentile,
    view: state.view,
    focus: state.focus,
    callDepth: state.callDepth,
    callDirection: state.callDirection,
    layoutId: state.layoutId,
    usesPhysics: state.layout?.id === state.layoutId
      ? state.layout.kind === 'dynamic'
      : layoutUsesPhysics(state.view, state.layoutId),
    recentSymbols: state.recentSymbols,
  };
}

function updateImpactKey() {
  const callers = state.callDirection !== 'callees';
  const callees = state.callDirection !== 'callers';
  const scope = callPresentationScope({
    layoutId: state.layout?.id,
    collapsedComponents: state.callCyclePresentation?.collapsedComponents,
    zoom: state.transform.k,
    totalLinkCount: state.model?.links?.length ?? 0,
    selectedId: state.selectedId,
    focusId: state.focus,
    hasExactPath: Boolean(findLoadedCallPath(state.model, state.selectedId)?.linkKeys.length),
  });
  elements.impactKeyInbound.hidden = !callers;
  elements.impactKeyOutbound.hidden = !callees;
  elements.impactKeyScope.hidden = !scope;
  elements.impactKeyScope.textContent = scope?.text ?? '';
  elements.impactKeyFocus.textContent = callers && callees
    ? '← selected →'
    : callers ? '← selected' : 'selected →';
  const directionLabel = callers && callees
    ? 'Callers lead to the selected symbol, which leads to callees'
    : callers ? 'Callers lead to the selected symbol' : 'Selected symbol leads to callees';
  const scopeLabel = scope ? `. ${scope.label}` : '';
  elements.impactKey.setAttribute('aria-label', `${directionLabel}${scopeLabel}`);
}

function refreshPanel(kinds = state.kinds) {
  updateImpactKey();
  updateFilterReadout();
  panel?.update(state.settings, panelContext(kinds));
}

function updateFilterReadout() {
  const summary = graphFilterSummary(state);
  elements.filterReadout.hidden = !summary;
  elements.filterReadoutCopy.textContent = summary?.short ?? '';
  if (summary) elements.filterReadout.setAttribute('aria-label', summary.label);
  else elements.filterReadout.removeAttribute('aria-label');
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
  if (key === 'hiddenKinds' || key === 'hiddenCodeSets' || key === 'hiddenRelationKinds' || key === 'showExternal') {
    saveLayoutCamera();
  }
  state.settings = clamp({ ...state.settings, [key]: value });
  if (key === 'hiddenRelationKinds') {
    state.hiddenRelationKinds = [...state.settings.hiddenRelationKinds];
    syncUrlState();
  }
  if (key === 'hiddenKinds') syncUrlState();
  if (key === 'hiddenCodeSets') syncUrlState();
  if (key === 'showExternal') syncUrlState();
  persistSettings();
  refreshPanel();

  if (key === 'theme') {
    state.theme = applyTheme(state.settings.theme, document.documentElement);
    draw();
    return;
  }

  if (key === 'hiddenKinds' || key === 'hiddenCodeSets' || key === 'hiddenRelationKinds' || key === 'showExternal') {
    if (state.rawData) {
      replaceSimulation(state.rawData, { preserve: true, fit: false });
      updateFieldCount();
    }
    return;
  }

  if (key === 'animate') {
    if (state.layout) {
      state.layout.setMotion(state.settings.animate);
      requestFrame();
    }
    return;
  }

  if (FORCE_SETTINGS.has(key) && state.layout?.kind === 'dynamic') {
    state.layout.configure(state.settings);
    requestFrame();
    return;
  }

  if (key === 'nodeSize') interactions?.invalidateNodeIndex();

  draw();
}

function resetSettings() {
  state.settings = clamp(DEFAULTS);
  state.hiddenRelationKinds = [];
  state.minRelationWeight = 1;
  state.fileEvidence = 'all';
  state.minCouplingPercentile = 0;
  state.theme = applyTheme(state.settings.theme, document.documentElement);
  persistSettings();
  syncUrlState();
  refreshPanel();
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
  state.recentSymbols = rememberRecentSymbol(state.recentSymbols, result);
  recentSymbolStore.save(state.meta?.mtime ?? state.mtime, state.recentSymbols);
  refreshPanel();
  state.file = null;
  state.focus = String(result.id);
  state.selectedId = state.focus;
  state.pendingSearchFocus = state.focus;
  syncUrlState();
  await loadGraphView('callgraph');
}

async function updateCallGraphQuery(key, value) {
  saveLayoutCamera();
  if (key === 'fileDirection') {
    const direction = normalizeFileDirection(value);
    if (direction === state.fileDirection) return;
    state.fileDirection = direction;
    syncUrlState();
    refreshPanel();
    if (state.view === 'filedeps' && state.rawData) {
      await replaceSimulation(state.rawData, { preserve: false, fit: true });
      updateFieldCount();
      renderInspector();
    }
    return;
  }
  if (key === 'minRelationWeight') {
    const minimum = normalizeMinimumRelationWeight(value);
    if (minimum === state.minRelationWeight) return;
    state.minRelationWeight = minimum;
    syncUrlState();
    refreshPanel();
    if (state.view === 'filedeps' && state.rawData) {
      await replaceSimulation(state.rawData, { preserve: true, fit: false });
      updateFieldCount();
    }
    return;
  }
  if (key === 'fileEvidence') {
    const evidence = normalizeFileEvidence(value);
    if (evidence === state.fileEvidence) return;
    state.fileEvidence = evidence;
    state.selectedId = null;
    state.neighborhood = null;
    syncUrlState();
    refreshPanel();
    if (state.view === 'filedeps' && state.rawData) {
      await replaceSimulation(state.rawData, { preserve: false, fit: true });
      updateFieldCount();
      renderInspector();
    }
    return;
  }
  if (key === 'minCouplingPercentile') {
    const percentile = normalizeMinimumCouplingPercentile(value);
    if (percentile === state.minCouplingPercentile) return;
    state.minCouplingPercentile = percentile;
    state.selectedId = null;
    state.neighborhood = null;
    syncUrlState();
    refreshPanel();
    if (state.view === 'filedeps' && state.rawData) {
      await replaceSimulation(state.rawData, { preserve: false, fit: true });
      updateFieldCount();
      renderInspector();
    }
    return;
  }
  if (key === 'depth') {
    const depth = normalizeCallDepth(value);
    if (depth === state.callDepth) return;
    state.callDepth = depth;
  } else if (key === 'direction') {
    const direction = normalizeCallDirection(value);
    if (direction === state.callDirection) return;
    state.callDirection = direction;
  } else {
    return;
  }
  syncUrlState();
  refreshPanel();
  if (state.view === 'callgraph' && state.focus) {
    await loadGraphView('callgraph', { preserve: true, fit: true, preserveSelection: true });
  }
}

async function clearGraphFilters() {
  saveLayoutCamera();
  if (state.view === 'filedeps') {
    state.hiddenRelationKinds = [];
    state.minRelationWeight = 1;
    state.fileEvidence = 'all';
    state.minCouplingPercentile = 0;
    state.fileDirection = 'both';
  }
  state.settings = clamp({
    ...state.settings,
    hiddenKinds: [],
    hiddenCodeSets: [],
    showExternal: true,
    ...(state.view === 'filedeps' ? { hiddenRelationKinds: [] } : {}),
  });
  persistSettings();
  syncUrlState();
  refreshPanel();
  if (state.rawData) {
    await replaceSimulation(state.rawData, { preserve: false, fit: true });
    updateFieldCount();
  }
}

function currentPerspectiveSnapshot() {
  return {
    ...state,
    settings: state.settings,
    transform: state.transform,
  };
}

function currentIndexMtime() {
  return state.meta?.mtime ?? state.mtime ?? null;
}

function announceToolbar(copy, graphCopy = copy) {
  window.clearTimeout(toolbarStatusTimer);
  elements.toolbarStatus.textContent = copy;
  elements.toolbarStatus.hidden = false;
  elements.graphStatus.textContent = graphCopy;
  toolbarStatusTimer = window.setTimeout(() => {
    elements.toolbarStatus.hidden = true;
    elements.toolbarStatus.textContent = '';
  }, 1_800);
}

function perspectiveLayoutLabel(item) {
  return layoutOptions(item.state.view)
    .find((option) => option.id === item.state.layoutId)?.label ?? item.state.layoutId;
}

function renderPerspectives() {
  const items = perspectiveStore.list(currentIndexMtime());
  elements.perspectiveList.replaceChildren();
  elements.perspectiveEmpty.hidden = items.length > 0;
  for (const item of items) {
    const row = document.createElement('li');
    row.className = 'perspective-row';
    const button = document.createElement('button');
    button.className = 'perspective-open';
    button.type = 'button';
    button.dataset.perspectiveId = item.id;
    const name = document.createElement('strong');
    name.textContent = item.name;
    button.append(name);
    if (item.stale) {
      const stale = document.createElement('span');
      stale.className = 'perspective-stale';
      stale.textContent = 'Index changed';
      button.append(stale);
    }
    const meta = document.createElement('small');
    meta.textContent = `${viewLabel(item.state.view)} · ${perspectiveLayoutLabel(item)}`;
    button.append(meta);
    button.addEventListener('click', () => { void openPerspective(item.id); });
    const actions = document.createElement('div');
    actions.className = 'perspective-actions';
    const exportJson = document.createElement('button');
    exportJson.type = 'button';
    exportJson.textContent = 'Copy JSON';
    exportJson.setAttribute('aria-label', `Copy ${item.name} as JSON`);
    exportJson.addEventListener('click', async () => {
      try {
        await copyText(perspectiveStore.export(item.id));
        elements.perspectiveStatus.textContent = `Copied “${item.name}” as JSON`;
      } catch (error) {
        elements.perspectiveStatus.textContent = error.message || 'Perspective JSON could not be copied';
      }
    });
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.textContent = 'Rename';
    rename.setAttribute('aria-label', `Rename ${item.name}`);
    rename.addEventListener('click', () => renderPerspectiveRename(row, item));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete ${item.name}`);
    remove.addEventListener('click', () => {
      if (remove.dataset.confirming === 'true') {
        perspectiveStore.delete(item.id);
        elements.perspectiveStatus.textContent = `Deleted “${item.name}”`;
        renderPerspectives();
        return;
      }
      remove.dataset.confirming = 'true';
      remove.textContent = 'Confirm delete';
      remove.classList.add('is-confirming');
      remove.setAttribute('aria-label', `Confirm delete ${item.name}`);
      window.setTimeout(() => {
        if (!remove.isConnected) return;
        delete remove.dataset.confirming;
        remove.textContent = 'Delete';
        remove.classList.remove('is-confirming');
        remove.setAttribute('aria-label', `Delete ${item.name}`);
      }, 4_000);
    });
    actions.append(exportJson, rename, remove);
    row.append(button, actions);
    elements.perspectiveList.append(row);
  }
}

function renderPerspectiveRename(row, item) {
  const form = document.createElement('form');
  form.className = 'perspective-rename';
  const label = document.createElement('label');
  label.className = 'sr-only';
  label.htmlFor = `perspective-rename-${item.id}`;
  label.textContent = `New name for ${item.name}`;
  const input = document.createElement('input');
  input.id = `perspective-rename-${item.id}`;
  input.maxLength = 80;
  input.required = true;
  input.value = item.name;
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', renderPerspectives);
  form.append(label, input, save, cancel);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const renamed = perspectiveStore.rename(item.id, input.value);
      elements.perspectiveStatus.textContent = `Renamed to “${renamed.name}”`;
      renderPerspectives();
    } catch (error) {
      elements.perspectiveStatus.textContent = error.message || 'Perspective could not be renamed';
      input.focus();
    }
  });
  row.replaceChildren(form);
  input.select();
}

function setActiveEntityIndex(index, { scroll = true } = {}) {
  const options = [...elements.entitiesList.querySelectorAll('[role="option"]')];
  activeEntityIndex = Math.min(options.length - 1, Math.max(-1, Number(index) || 0));
  elements.entityQuery.removeAttribute('aria-activedescendant');
  for (const [optionIndex, option] of options.entries()) {
    const active = optionIndex === activeEntityIndex;
    option.setAttribute('aria-selected', String(active));
    if (!active) continue;
    elements.entityQuery.setAttribute('aria-activedescendant', option.id);
    if (scroll) option.scrollIntoView({ block: 'nearest' });
  }
}

function activateEntityBrowserIndex(index) {
  const option = elements.entitiesList.querySelectorAll('[role="option"]')[index];
  option?.click();
}

function renderEntityBrowser(query = elements.entityQuery.value) {
  const browseModel = state.view === 'callgraph'
    ? state.model
    : state.presentedModel || state.model;
  const result = browseGraphEntities(browseModel, query);
  elements.entitiesList.replaceChildren();
  activeEntityIndex = -1;
  elements.entityQuery.removeAttribute('aria-activedescendant');
  elements.entitiesStatus.textContent = result.total === 0
    ? 'No matching entities'
    : result.limited
      ? `${result.items.length.toLocaleString()} of ${result.total.toLocaleString()} entities shown · refine search for more`
      : `${result.total.toLocaleString()} ${result.total === 1 ? 'entity' : 'entities'}`;
  for (const [index, item] of result.items.entries()) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'entity-open';
    button.type = 'button';
    button.id = `entity-option-${index}`;
    button.setAttribute('role', 'option');
    button.tabIndex = -1;
    button.setAttribute('aria-selected', 'false');
    button.dataset.nodeId = item.id;
    const name = document.createElement('strong');
    name.textContent = item.label;
    const evidence = document.createElement('span');
    evidence.textContent = `${item.inbound} in · ${item.outbound} out`;
    const detail = document.createElement('small');
    detail.textContent = [item.kind, item.path].filter(Boolean).join(' · ');
    button.append(name, evidence, detail);
    button.addEventListener('click', () => {
      const node = state.model?.indexes?.nodesById.get(item.id);
      if (!node) return;
      elements.entitiesDialog.close();
      selectNodeByKeyboard(node);
      elements.canvas.focus();
    });
    button.addEventListener('mouseenter', () => setActiveEntityIndex(index, { scroll: false }));
    row.append(button);
    elements.entitiesList.append(row);
  }
}

async function openPerspective(id) {
  const item = perspectiveStore.get(id, currentIndexMtime());
  if (!item) return;
  saveCurrentModeState();
  state.settings = clamp(item.settings);
  state.theme = applyTheme(state.settings.theme, document.documentElement);
  Object.assign(state, {
    view: item.state.view,
    layoutId: item.state.layoutId,
    prefix: item.state.prefix,
    file: item.state.file,
    focus: item.state.focus,
    callDepth: item.state.callDepth,
    callDirection: item.state.callDirection,
    hiddenRelationKinds: [...item.state.hiddenRelationKinds],
    minRelationWeight: item.state.minRelationWeight,
    fileEvidence: item.state.fileEvidence,
    minCouplingPercentile: item.state.minCouplingPercentile,
    selectedId: item.state.selectedId,
    activeId: null,
    neighborhood: null,
    transform: d3.zoomIdentity
      .translate(item.state.transform.x, item.state.transform.y)
      .scale(item.state.transform.k),
  });
  state.settings = clamp({ ...state.settings, hiddenRelationKinds: state.hiddenRelationKinds });
  state.pendingSearchFocus = state.focus;
  persistSettings();
  elements.perspectivesDialog.close();
  await loadGraphView(state.view, {
    preserve: false,
    fit: false,
    preserveSelection: true,
  });
  announceToolbar(item.stale ? 'Opened perspective · index changed' : 'Perspective opened');
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
  const byId = nextModel.indexes.nodesById;
  for (const node of nextModel.nodes) {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) continue;
    const neighbors = [];
    for (const neighborId of nextModel.indexes.neighborsById.get(node.id)) {
      const neighbor = byId.get(neighborId);
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
    model: state.presentedModel || state.model || { nodes: [], links: [] },
    matrix: state.layout?.matrix,
    matrixHover: state.matrixHover,
    matrixSelection: state.matrixSelection || state.matrixEntityFocus,
    scaleMode: state.layout?.scaleMode,
    transform: state.transform,
    theme: state.theme,
    settings: state.settings,
    activeId: state.activeId,
    selectedId: state.selectedId,
    neighborhood: state.neighborhood,
    layoutId: state.layout?.id || state.layoutId,
    view: state.view,
  });
}

function requestFrame() {
  if (state.frame != null) return;
  state.frame = requestAnimationFrame(animationFrame);
}

function cancelWarmup() {
  if (!state.warmup) return;
  const { resolve } = state.warmup;
  state.warmup = null;
  resolve(false);
}

function animationFrame() {
  state.frame = null;
  const layout = state.layout;
  if (!layout) {
    draw();
    return;
  }

  const warmup = state.warmup?.layout === layout ? state.warmup : null;
  if (warmup) {
    const result = tickWithinBudget(layout, warmup.remaining, {
      budgetMs: WARMUP_BUDGET_MS,
    });
    warmup.remaining = result.remaining;
    if (!warmup.remaining) {
      state.warmup = null;
      interactions?.updateNodeIndex();
      if (warmup.fit) fitGraph();
      warmup.resolve(true);
    }
  } else {
    layout.tick(state.settings.animate);
  }
  interactions?.invalidateNodeIndex();
  draw();

  if (layout === state.layout && (
    state.warmup?.layout === layout
    || layout.shouldContinue(state.settings.animate)
  )) {
    requestFrame();
  }
}

function graphFitPadding(width, height) {
  const padding = Math.min(90, Math.max(36, Math.min(width, height) * 0.1));
  const inspectorBounds = elements.inspector.hidden
    ? { width: 0, height: 0 }
    : elements.inspector.getBoundingClientRect();
  const compactInspector = !elements.inspector.hidden && window.matchMedia('(max-width: 760px)').matches;
  const matrixLayout = state.layoutId === 'dependency-matrix';
  const matrixHeaderLeft = matrixLayout ? Math.min(120, width * 0.22) : 0;
  const matrixHeaderTop = matrixLayout ? Math.min(100, height * 0.16) : 0;
  const matrixHeaderRight = matrixLayout ? Math.min(60, width * 0.09) : 0;
  const structureLabelRight = state.layoutId === 'structure-tree'
    ? Math.min(150, width * 0.32)
    : 0;
  return {
    top: padding + matrixHeaderTop,
    right: (compactInspector ? padding : padding + inspectorBounds.width)
      + matrixHeaderRight
      + structureLabelRight,
    bottom: compactInspector ? padding + inspectorBounds.height : padding,
    left: padding + matrixHeaderLeft,
  };
}

function fitSelectedCallPath(selectedId) {
  if (state.view !== 'callgraph' || !interactions) return false;
  const path = findLoadedCallPath(state.model, selectedId);
  if (!path) return false;
  const focusNode = state.model.nodes.find((node) => node.focus || node.relationRole === 'focus');
  const fittedIds = [...new Set([
    ...path.nodeIds,
    String(selectedId),
    focusNode == null ? null : String(focusNode.id),
  ].filter(Boolean))];
  const nodes = fittedIds
    .map((id) => state.presentedModel?.indexes?.nodesById.get(id)
      || state.model.indexes.nodesById.get(id))
    .filter(Boolean);
  const { width, height } = renderer.getSize();
  if (!width || !height || nodes.length < 2) return false;
  const padding = graphFitPadding(width, height);
  padding.top += 64;
  if (window.matchMedia('(max-width: 760px)').matches) padding.bottom += 56;
  interactions.fit(nodes, {
    width,
    height,
    padding,
    minScale: 0.02,
  });
  return true;
}

function fitGraph() {
  const { width, height } = renderer.getSize();
  if (!width || !height) return;
  const fitPadding = graphFitPadding(width, height);
  if (interactions) {
    interactions.fit(state.presentedModel?.nodes || state.model?.nodes || [], { width, height, padding: fitPadding });
  } else {
    state.transform = d3.zoomIdentity.translate(width / 2, height / 2);
    draw();
  }
}

function replaceSimulation(data, { preserve = false, fit = true, positions = null } = {}) {
  const previousModel = preserve ? (state.presentedModel || state.model) : null;
  const model = buildModel(filteredData(data), undefined, { view: state.view });
  const callCycleScope = state.view === 'callgraph'
    ? `${state.focus ?? ''}|${state.callDepth}|${state.callDirection}`
    : null;
  if (callCycleScope !== state.callCycleExpandedScope) {
    state.callCycleExpandedIds.clear();
    state.callCycleExpandedScope = callCycleScope;
  }
  const selectedAwayFromFocus = state.selectedId != null
    && String(state.selectedId) !== String(state.focus);
  const expandedComponentIds = new Set(state.callCycleExpandedIds);
  if (selectedAwayFromFocus) {
    const selectedComponent = model.indexes?.componentByNodeId?.get(String(state.selectedId));
    if (selectedComponent) expandedComponentIds.add(selectedComponent.id);
  }
  const callCyclePresentation = state.view === 'callgraph' && state.focus
    ? buildCallCyclePresentation(model, {
      focusId: state.focus,
      selectedId: state.selectedId,
      expandedComponentIds,
    })
    : null;
  const layoutModel = callCyclePresentation?.model || model;
  const carriedPositions = carryPositions(previousModel, layoutModel);
  const restoredPositions = applyCachedPositions(layoutModel.nodes, positions);
  const reusedPositions = carriedPositions || restoredPositions > 0;

  cancelWarmup();
  state.layout?.dispose();
  state.model = model;
  state.callCyclePresentation = callCyclePresentation;
  state.presentedModel = layoutModel;
  updateFiledepsKey();
  const visibleIds = new Set(layoutModel.nodes.map((node) => String(node.id)));
  if (state.activeId && !visibleIds.has(state.activeId)) state.activeId = null;
  const removedSelection = Boolean(state.selectedId && !visibleIds.has(state.selectedId));
  if (removedSelection) state.selectedId = null;
  if (removedSelection) syncUrlState();
  if (state.view === 'filedeps' && state.fileDirection !== 'both' && !state.selectedId) {
    state.fileDirection = 'both';
    syncUrlState();
  }
  state.neighborhood = neighborhoodFor(state.activeId || state.selectedId);
  if (state.view === 'architecture') {
    state.layout = state.layoutId === 'structure-tree'
      ? createStructureTreeLayoutController(layoutModel, {
        collapsedIds: structureCollapse.get(state.prefix),
      })
      : createNodesLayoutController(d3, layoutModel, state.settings, { cx: 0, cy: 0 });
  } else if (state.view === 'filedeps' && state.layoutId === 'dependency-matrix') {
    state.layout = createDependencyMatrixLayoutController(layoutModel);
  } else if (state.view === 'filedeps' && state.layoutId === 'hotspot-landscape') {
    state.layout = createHotspotLayoutController(d3, layoutModel, state.settings, { cx: 0, cy: 0 });
  } else if (state.view === 'callgraph' && state.focus) {
    state.layout = state.layoutId === 'radial-reach'
      ? createRadialReachLayoutController(layoutModel, state.focus)
      : createImpactFlowLayoutController(layoutModel, state.focus);
  } else {
    state.layout = createForceLayoutController(d3, layoutModel, state.settings, { cx: 0, cy: 0 });
  }
  state.matrixEntityFocus = !state.matrixSelection && state.selectedId
    ? matrixFocusFor(state.selectedId, state.transform.k)?.position ?? null
    : null;
  refreshPanel();
  if (restoredPositions > 0) state.layout.simulation?.alpha(0).stop();
  if (state.layout.id === 'structure-tree') {
    structureCollapse.save(state.prefix, state.layout.tree.collapsedIds);
  }
  syncPresentedModel();
  renderInspector();
  elements.impactKey.hidden = !['impact-flow', 'radial-reach'].includes(state.layout.id);
  if (!fit) interactions?.setTransform(state.transform);

  const warmupTicks = restoredPositions > 0
    ? 0
    : state.layout.warmupTicks(reusedPositions);
  return new Promise((resolve) => {
    state.warmup = {
      layout: state.layout,
      remaining: warmupTicks,
      fit,
      resolve,
    };
    requestFrame();
  });
}

function graphOptions() {
  return buildGraphOptions(state);
}

async function switchLayout(layoutId) {
  const next = normalizeLayoutId(state.view, layoutId);
  if (next === state.layoutId) return;
  saveCurrentGraphPositions();
  saveLayoutCamera();
  const camera = restoreLayoutCamera(next);
  state.layoutId = next;
  state.matrixHover = null;
  state.matrixSelection = null;
  state.matrixEntityFocus = null;
  syncLayoutControl();
  syncUrlState();
  refreshPanel();
  renderInspector();
  if (!state.rawData) return;
  if (state.view === 'callgraph' && !state.focus) return;
  if (state.view === 'architecture') {
    await loadGraphView(state.view, { preserveSelection: true, fit: !camera });
    return;
  }
  const activityTicket = layoutLoading.begin({
    ariaLabel: layoutActivityLabel(state.view, state.layoutId),
  });
  const transitionTicket = frameTransition.capture();
  try {
    const positions = state.loadedGraphOptions
      ? graphCache.getPositions(state.loadedGraphOptions, state.layoutId)
      : null;
    const ready = await replaceSimulation(state.rawData, {
      preserve: false,
      fit: !camera,
      positions,
    });
    if (ready) frameTransition.reveal(transitionTicket);
    else frameTransition.clear(transitionTicket);
    updateFieldCount();
    const selectedLayout = layoutOptions(state.view)
      .find((option) => option.id === state.layoutId)?.label || state.layoutId;
    elements.graphStatus.textContent = graphReadyAnnouncement(
      `${selectedLayout} layout`,
      elements.fieldCount.textContent,
    );
  } catch (error) {
    frameTransition.clear(transitionTicket);
    throw error;
  } finally {
    layoutLoading.finish(activityTicket);
  }
}

async function loadGraphView(view = state.view, {
  preserve = false,
  fit = true,
  preserveSelection = false,
} = {}) {
  layoutLoading.reset();
  saveCurrentGraphPositions();
  const viewChanged = view !== state.view;
  state.view = view;
  if (viewChanged && !preserveSelection) {
    state.activeId = null;
    state.selectedId = null;
    state.neighborhood = null;
    state.matrixHover = null;
    state.matrixSelection = null;
    state.matrixEntityFocus = null;
    renderInspector();
  }
  state.requestSequence += 1;
  const sequence = state.requestSequence;
  state.graphRequest?.abort();
  state.graphRequest = new AbortController();
  const loadingTicket = state.model
    ? graphLoading.begin(loadingCopy(view, state.layoutId))
    : null;

  setActiveTab(view);
  renderCrumbs();
  syncUrlState();
  elements.fieldCount.textContent = 'Loading graph…';
  elements.impactKey.hidden = true;
  elements.filedepsKey.hidden = true;

  if (view === 'callgraph' && !state.file && !state.focus) {
    state.rawData = null;
    state.loadedGraphOptions = null;
    state.model = null;
    state.presentedModel = null;
    state.callCyclePresentation = null;
    state.kinds = [];
    cancelWarmup();
    state.layout?.dispose();
    state.layout = null;
    elements.impactKey.hidden = true;
    state.activeId = null;
    state.selectedId = null;
    state.neighborhood = null;
    elements.fieldCount.textContent = 'Select a symbol';
    elements.fieldWarning.hidden = true;
    refreshPanel([]);
    showPlaceholder(
      'Choose a symbol',
      'Search for a function or method to trace its callers, callees, and potential impact.',
      { actionLabel: 'Find a symbol', onAction: () => panel?.open() },
    );
    if (loadingTicket != null) graphLoading.finish(loadingTicket);
    draw();
    return;
  }

  if (!state.model) showPlaceholder('Mapping project', 'Reading the local code index and preparing the field.');

  let transitionTicket = null;
  try {
    const options = graphOptions();
    let data = graphCache.getData(options);
    if (!data) {
      data = await getGraph(options, { signal: state.graphRequest.signal });
      if (!data.error) {
        graphCache.setVersion(data.mtime);
        graphCache.setData(options, data);
      }
    }
    if (sequence !== state.requestSequence) return;
    if (data.error) {
      if (loadingTicket != null) graphLoading.finish(loadingTicket);
      elements.fieldCount.textContent = 'Load failed';
      state.model = null;
      state.presentedModel = null;
      state.callCyclePresentation = null;
      state.loadedGraphOptions = null;
      cancelWarmup();
      state.layout?.dispose();
      state.layout = null;
      elements.impactKey.hidden = true;
      showPlaceholder(
        'Schema not detected',
        'Open /api/schema to inspect the detected database tables.',
        {
          error: true,
          actionLabel: 'Retry graph',
          dismissOnAction: Boolean(state.model),
          onAction: () => loadGraphView(view, { preserveSelection: true }),
        },
      );
      draw();
      return;
    }

    state.rawData = data;
    state.loadedGraphOptions = options;
    state.mtime = data.mtime;
    state.kinds = [...new Set(data.nodes.map((node) => String(node.kind || 'unknown')))];
    state.relations = state.view === 'filedeps' ? relationKindSummary(data.edges) : [];
    refreshPanel();
    if (state.model) transitionTicket = frameTransition.capture();
    const positions = graphCache.getPositions(options, state.layoutId);
    const ready = await replaceSimulation(data, { preserve, fit, positions });
    if (!ready || sequence !== state.requestSequence) {
      if (transitionTicket != null) frameTransition.clear(transitionTicket);
      return;
    }
    updateFieldCount();
    elements.graphStatus.textContent = graphReadyAnnouncement(
      viewLabel(view),
      elements.fieldCount.textContent,
    );
    const scopeWarning = truncationMessage(data);
    elements.fieldWarning.hidden = !scopeWarning;
    elements.fieldWarning.textContent = truncationLabel(data) || '';
    elements.fieldWarning.setAttribute('aria-label', scopeWarning || '');

    if (state.model.nodes.length) hidePlaceholder();
    else showPlaceholder('Nothing in this scope', 'Choose another view or move back through the breadcrumb trail.');
    if (loadingTicket != null) graphLoading.finish(loadingTicket);
    if (transitionTicket != null) frameTransition.reveal(transitionTicket);

    if (state.pendingSearchFocus) {
      const targetId = state.pendingSearchFocus;
      state.pendingSearchFocus = null;
      const node = state.model.nodes.find((candidate) => String(candidate.id) === targetId);
      if (node) {
        state.selectedId = targetId;
        state.neighborhood = neighborhoodFor(targetId);
        renderInspector();
        if (!fitSelectedCallPath(targetId)) {
          if (pendingSelectionCameraAction(state.view, targetId, state.focus) === 'center') {
            interactions?.centerOn(
              node,
              selectionCenterOptions(Math.max(1.8, interactions.getTransform().k)),
            );
          } else {
            draw();
          }
        }
        draw();
      }
    }
  } catch (error) {
    if (transitionTicket != null) frameTransition.clear(transitionTicket);
    if (loadingTicket != null) graphLoading.finish(loadingTicket);
    if (error?.name === 'AbortError') return;
    elements.fieldCount.textContent = 'Load failed';
    showPlaceholder(
      'Graph unavailable',
      error?.message || 'The graph request failed.',
      {
        error: true,
        actionLabel: 'Retry graph',
        dismissOnAction: Boolean(state.model),
        onAction: () => loadGraphView(view, { preserveSelection: true }),
      },
    );
  }
}

async function pollVersion() {
  if (document.hidden) return;
  try {
    const { mtime } = await getVersion();
    if (state.mtime != null && mtime !== state.mtime) {
      graphCache.setVersion(mtime);
      state.loadedGraphOptions = null;
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
    getModel: () => state.presentedModel || state.model,
    getSimulation: () => state.layout?.simulation || null,
    getMatrix: () => state.layout?.matrix || null,
    getNodeScale: () => state.settings.nodeSize,
    onTransform: (transform) => {
      state.transform = transform;
      updateImpactKey();
      draw();
    },
    onHover: setHover,
    onNodeClick: handleNodeClick,
    onNodeDoubleClick: handleNodeDoubleClick,
    onMatrixHover: setMatrixHover,
    onMatrixClick: handleMatrixClick,
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
  context: panelContext(),
  kindColors: KIND_COLORS,
  onChange: updateSetting,
  onQueryChange: updateCallGraphQuery,
  onReset: resetSettings,
  onSearch: runSearch,
  onSelectSearch: focusSearchResult,
});

elements.placeholderAction.addEventListener('click', () => {
  const activation = placeholderAction.activate();
  if (activation.dismiss) hidePlaceholder();
});
elements.clearFilters.addEventListener('click', () => {
  void clearGraphFilters();
});
elements.openPerspectives.addEventListener('click', () => {
  elements.perspectiveStatus.textContent = '';
  renderPerspectives();
  elements.perspectivesDialog.showModal();
  requestAnimationFrame(() => elements.perspectiveName.focus());
});
elements.closePerspectives.addEventListener('click', () => elements.perspectivesDialog.close());
elements.perspectiveSaveForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const saved = perspectiveStore.save(
      elements.perspectiveName.value,
      currentPerspectiveSnapshot(),
      currentIndexMtime(),
    );
    elements.perspectiveName.value = '';
    elements.perspectiveStatus.textContent = `Saved “${saved.name}”`;
    renderPerspectives();
  } catch (error) {
    elements.perspectiveStatus.textContent = error.message || 'Perspective could not be saved';
  }
});
elements.importPerspective.addEventListener('click', () => {
  try {
    const imported = perspectiveStore.import(
      elements.perspectiveImportJson.value,
      currentIndexMtime(),
    );
    elements.perspectiveImportJson.value = '';
    elements.perspectiveImport.open = false;
    elements.perspectiveStatus.textContent = imported.stale
      ? `Imported “${imported.name}” · index changed`
      : `Imported “${imported.name}”`;
    renderPerspectives();
  } catch (error) {
    elements.perspectiveStatus.textContent = error.message || 'Perspective JSON could not be imported';
    elements.perspectiveImportJson.focus();
  }
});
elements.openEntities.addEventListener('click', () => {
  elements.entityQuery.value = '';
  renderEntityBrowser('');
  elements.entitiesDialog.showModal();
  elements.entityQuery.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => elements.entityQuery.focus());
});
elements.closeEntities.addEventListener('click', () => elements.entitiesDialog.close());
elements.entitiesDialog.addEventListener('close', () => {
  activeEntityIndex = -1;
  elements.entityQuery.setAttribute('aria-expanded', 'false');
  elements.entityQuery.removeAttribute('aria-activedescendant');
});
elements.entityQuery.addEventListener('input', () => renderEntityBrowser());
elements.entityQuery.addEventListener('keydown', (event) => {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const count = elements.entitiesList.querySelectorAll('[role="option"]').length;
    setActiveEntityIndex(searchIndexAfterKey(activeEntityIndex, count, event.key));
  } else if (event.key === 'Enter' && activeEntityIndex >= 0) {
    event.preventDefault();
    activateEntityBrowserIndex(activeEntityIndex);
  }
});
elements.inspectorClose.addEventListener('click', clearSelectionAndReturnFocus);
elements.inspectorCopyName.addEventListener('click', () => copyInspectorField('name'));
elements.inspectorCopyPath.addEventListener('click', () => copyInspectorField('path'));
elements.inspectorCenter.addEventListener('click', () => {
  const node = state.presentedModel?.indexes?.nodesById.get(state.selectedId)
    || state.model?.indexes?.nodesById.get(state.selectedId);
  if (!node) return;
  const matrixFocus = matrixFocusFor(state.selectedId);
  state.matrixEntityFocus = matrixFocus?.position ?? state.matrixEntityFocus;
  interactions?.centerOn(
    node,
    selectionCenterOptions(matrixFocus?.scale ?? Math.max(1.4, interactions.getTransform().k)),
  );
});
elements.inspectorDisclosure.addEventListener('click', () => {
  if (state.view === 'callgraph') {
    toggleCallCycleDisclosure();
    return;
  }
  const node = state.model?.indexes?.nodesById.get(String(state.selectedId));
  toggleStructureDisclosure(node);
});
elements.inspectorCycleToggle.addEventListener('click', () => {
  state.cycleExpanded = !state.cycleExpanded;
  renderInspector();
});
elements.inspector.addEventListener('click', (event) => {
  const id = event.target.closest('[data-node-id]')?.dataset.nodeId;
  const node = id && state.model?.indexes?.nodesById.get(id);
  if (!node) return;
  state.matrixSelection = null;
  const matrixFocus = matrixFocusFor(id);
  state.matrixEntityFocus = matrixFocus?.position ?? null;
  state.selectedId = id;
  state.neighborhood = neighborhoodFor(id);
  syncUrlState();
  refreshPanel();
  if (refreshDirectionalSelection()) return;
  if (refreshCallCyclePresentation()) return;
  renderInspector();
  if (fitSelectedCallPath(id)) return;
  if (interactions) {
    interactions.centerOn(
      node,
      selectionCenterOptions(matrixFocus?.scale ?? Math.max(1.4, interactions.getTransform().k)),
    );
    return;
  }
  draw();
});

elements.tabs.addEventListener('click', (event) => {
  const view = event.target.closest('[data-view]')?.dataset.view;
  if (view) switchMode(view);
});
elements.tabs.addEventListener('keydown', (event) => {
  const tabs = [...elements.tabs.querySelectorAll('[data-view]')];
  const current = event.target.closest('[data-view]');
  const nextIndex = tabIndexAfterKey(tabs.indexOf(current), tabs.length, event.key);
  if (nextIndex == null) return;
  event.preventDefault();
  const next = tabs[nextIndex];
  next.focus();
  switchMode(next.dataset.view);
});
elements.layoutSelect.addEventListener('change', () => {
  switchLayout(elements.layoutSelect.value);
});

elements.fitGraph.addEventListener('click', fitGraph);
elements.copyInvestigation.addEventListener('click', async () => {
  syncUrlState();
  try {
    await copyText(investigationUrl(window.location));
    announceToolbar('Link copied', 'Investigation link copied.');
  } catch {
    announceToolbar('Copy failed', 'Investigation link could not be copied.');
  }
});
elements.canvas.addEventListener('keydown', (event) => {
  if (event.key === '0' || event.key.toLowerCase() === 'f') {
    event.preventDefault();
    fitGraph();
  } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const nodes = state.presentedModel?.nodes || state.model?.nodes || [];
    const id = directionalNodeId(nodes, state.selectedId, event.key);
    const node = id == null
      ? null
      : state.presentedModel?.indexes?.nodesById.get(id)
        || state.model?.indexes?.nodesById.get(id);
    if (node) selectNodeByKeyboard(node);
  } else if (event.key === 'Enter' && state.selectedId != null) {
    const node = state.presentedModel?.indexes?.nodesById.get(String(state.selectedId))
      || state.model?.indexes?.nodesById.get(String(state.selectedId));
    if (node) {
      event.preventDefault();
      handleNodeDoubleClick(node);
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    clearSelectionAndReturnFocus();
  }
});

window.addEventListener('beforeunload', () => {
  state.graphRequest?.abort();
  searchRequest?.abort();
  cancelWarmup();
  state.layout?.dispose();
  interactions?.destroy();
});

const resizeObserver = new ResizeObserver(() => {
  const previousSize = renderer.getSize();
  const nextSize = renderer.resize();
  if (!state.model) {
    draw();
    return;
  }

  const resizedTransform = cameraAfterViewportResize(state.transform, previousSize, nextSize);
  if (interactions) state.transform = interactions.setTransform(resizedTransform);
  else state.transform = resizedTransform;
  draw();
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
