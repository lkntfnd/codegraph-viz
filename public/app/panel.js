import { nodeKindShape } from './nodeShape.js';
import { searchIndexAfterKey } from './searchNavigation.js';

const CORE_FORCES = ['centerForce', 'repelForce', 'linkForce', 'linkDistance'];
const ADVANCED_FORCES = ['collidePad', 'velocityDecay', 'alphaDecay'];
const DISPLAY_CONTROLS = [
  'showLabels',
  'labelDensity',
  'labelZoom',
  'labelSize',
  'nodeSize',
  'linkThickness',
  'animate',
  'curvedLinks',
];

function element(tagName, { className, text, ...attributes } = {}) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) {
    if (value != null) node.setAttribute(name, String(value));
  }
  return node;
}

function section(title, { open = true } = {}) {
  const details = element('details', { className: 'panel-section' });
  details.open = open;
  const summary = element('summary', { text: title });
  const body = element('div', { className: 'panel-section-body' });
  details.append(summary, body);
  return { details, body };
}

function decimalsFor(step) {
  const text = String(step);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

function formatValue(value, definition) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(definition.default);
  return numeric.toFixed(Math.min(3, decimalsFor(definition.step)));
}

function updateRangeFill(input, definition) {
  const span = definition.max - definition.min || 1;
  const percent = ((Number(input.value) - definition.min) / span) * 100;
  input.style.setProperty('--range-fill', `${Math.min(100, Math.max(0, percent))}%`);
}

function normalizedKind(kind) {
  return String(kind || 'unknown').trim().toLowerCase() || 'unknown';
}

export function createPanel({
  root,
  schema,
  settings,
  context = {},
  kindColors,
  onChange,
  onQueryChange,
  onReset,
  onSearch,
  onSelectSearch,
}) {
  if (!root) throw new TypeError('createPanel requires a root element');

  let current = settings;
  let currentContext = context;
  let currentKinds = [];
  let currentCodeSets = [];
  let currentRelations = [];
  let searchTimer = null;
  let searchSequence = 0;
  let searchItems = [];
  let activeSearchIndex = -1;
  const controls = new Map();

  const toggle = element('button', {
    className: 'settings-toggle',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': 'graph-settings-panel',
  });
  toggle.append(
    element('span', { className: 'settings-toggle-icon', text: '⚙', 'aria-hidden': 'true' }),
    element('span', { text: 'Controls' }),
  );

  const panel = element('aside', {
    className: 'settings-panel',
    id: 'graph-settings-panel',
    'aria-label': 'Graph controls',
  });
  panel.hidden = true;

  const header = element('div', { className: 'settings-header' });
  const headerCopy = element('div');
  headerCopy.append(
    element('h2', { text: 'Graph controls' }),
    element('p', { text: 'Filter relationships and tune the view.' }),
  );
  const close = element('button', {
    className: 'panel-close',
    text: '×',
    type: 'button',
    'aria-label': 'Close graph controls',
  });
  header.append(headerCopy, close);

  const content = element('div', { className: 'settings-content' });

  const filters = section('Filters');
  const searchWrap = element('div', { className: 'search-control' });
  const searchLabel = element('label', { className: 'control-caption', text: 'Find a symbol', for: 'graph-search' });
  const searchInput = element('input', {
    id: 'graph-search',
    type: 'search',
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-controls': 'graph-search-results',
    'aria-expanded': 'false',
    placeholder: 'Type a function or class…',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const searchStatus = element('div', { className: 'search-status', 'aria-live': 'polite' });
  const searchResults = element('div', {
    className: 'search-results',
    id: 'graph-search-results',
    role: 'listbox',
  });
  searchResults.hidden = true;
  searchWrap.append(searchLabel, searchInput, searchStatus, searchResults);
  filters.body.append(searchWrap);

  const callQuery = element('div', { className: 'call-query' });
  const directionControl = element('fieldset', { className: 'query-choice' });
  directionControl.append(element('legend', { text: 'Direction' }));
  const directionOptions = element('div', { className: 'query-segment' });
  for (const [value, label] of [['callers', 'Callers'], ['both', 'Both'], ['callees', 'Callees']]) {
    const option = element('label');
    const input = element('input', { type: 'radio', name: 'call-direction', value });
    input.addEventListener('change', () => {
      if (input.checked) onQueryChange?.('direction', value);
    });
    option.append(input, element('span', { text: label }));
    directionOptions.append(option);
  }
  directionControl.append(directionOptions);
  const depthControl = element('div', { className: 'range-control' });
  const depthLabel = element('label', { for: 'call-depth' });
  const depthReadout = element('output', { for: 'call-depth' });
  const depthInput = element('input', {
    id: 'call-depth', type: 'range', min: 1, max: 5, step: 1,
  });
  const updateDepthReadout = () => {
    const depth = Number(depthInput.value);
    depthReadout.value = `${depth} hop${depth === 1 ? '' : 's'}`;
    updateRangeFill(depthInput, { min: 1, max: 5 });
  };
  depthLabel.append(element('span', { text: 'Trace depth' }), depthReadout);
  depthInput.addEventListener('input', updateDepthReadout);
  depthInput.addEventListener('change', () => onQueryChange?.('depth', Number(depthInput.value)));
  depthControl.append(
    depthLabel,
    depthInput,
    element('p', {
      className: 'control-help',
      text: 'Include matching relations up to this many hops from the selected symbol.',
    }),
  );
  callQuery.append(
    element('p', { className: 'control-caption', text: 'Impact reach' }),
    directionControl,
    depthControl,
  );
  filters.body.append(callQuery);

  const kindControls = element('div', { className: 'kind-controls' });
  filters.body.append(kindControls);
  const codeSetControls = element('div', { className: 'code-set-controls' });
  filters.body.append(codeSetControls);
  const relationControls = element('div', { className: 'relation-controls' });
  filters.body.append(relationControls);

  function emit(key, value) {
    current = { ...current, [key]: value };
    onChange?.(key, value);
  }

  function makeBoolean(key) {
    const definition = schema[key];
    const row = element('label', { className: 'switch-row' });
    const label = element('span', { className: 'control-label', text: definition.label });
    const input = element('input', { type: 'checkbox', 'data-setting': key });
    const track = element('span', { className: 'switch-track', 'aria-hidden': 'true' });
    input.addEventListener('change', () => emit(key, input.checked));
    row.append(label, input, track);
    controls.set(key, { input, definition, row });
    return row;
  }

  filters.body.append(makeBoolean('showExternal'));

  const groups = section('Legend', { open: false });
  const legend = element('div', { className: 'kind-legend' });
  const legendKinds = [
    ['folder', 'Folder / module'],
    ['file', 'File'],
    ['function', 'Function / method'],
    ['class', 'Class / interface'],
    ['external', 'External'],
  ];
  for (const [kind, label] of legendKinds) {
    const item = element('div', { className: 'legend-item' });
    const swatch = element('span', { className: 'kind-swatch', 'aria-hidden': 'true' });
    swatch.style.background = kindColors[kind];
    if (kind === 'external') swatch.dataset.external = 'true';
    item.append(swatch, element('span', { text: label }));
    legend.append(item);
  }
  groups.body.append(legend);

  function makeRange(key) {
    const definition = schema[key];
    const control = element('div', { className: 'range-control' });
    const label = element('label', { for: `setting-${key}` });
    const readout = element('output', { for: `setting-${key}` });
    label.append(element('span', { text: definition.label }), readout);
    const input = element('input', {
      id: `setting-${key}`,
      type: 'range',
      min: definition.min,
      max: definition.max,
      step: definition.step,
      'data-setting': key,
    });
    input.addEventListener('input', () => {
      const value = Number(input.value);
      readout.value = formatValue(value, definition);
      updateRangeFill(input, definition);
      emit(key, value);
    });
    control.append(label, input);
    controls.set(key, { input, readout, definition });
    return control;
  }

  function makeChoice(key) {
    const definition = schema[key];
    const fieldset = element('fieldset', { className: 'query-choice display-choice' });
    fieldset.append(element('legend', { text: definition.label }));
    const options = element('div', { className: 'query-segment' });
    for (const value of definition.values) {
      const label = element('label');
      const input = element('input', { type: 'radio', name: `setting-${key}`, value });
      input.addEventListener('change', () => {
        if (input.checked) emit(key, value);
      });
      label.append(input, element('span', { text: value[0].toUpperCase() + value.slice(1) }));
      options.append(label);
      controls.set(`choice:${key}:${value}`, { input, definition });
    }
    fieldset.append(options);
    return fieldset;
  }

  const display = section('Display');
  for (const key of DISPLAY_CONTROLS) {
    const type = schema[key].type;
    display.body.append(type === 'range' ? makeRange(key) : type === 'enum' ? makeChoice(key) : makeBoolean(key));
  }

  const forces = section('Forces');
  for (const key of CORE_FORCES) forces.body.append(makeRange(key));
  const advanced = element('details', { className: 'advanced-forces' });
  advanced.append(element('summary', { text: 'Advanced physics' }));
  const advancedBody = element('div', { className: 'advanced-force-body' });
  for (const key of ADVANCED_FORCES) advancedBody.append(makeRange(key));
  advanced.append(advancedBody);
  forces.body.append(advanced);

  const theme = section('Theme', { open: false });
  const themeControl = element('fieldset', { className: 'theme-control' });
  themeControl.append(element('legend', { className: 'sr-only', text: 'Graph theme' }));
  for (const name of ['dark', 'black']) {
    const label = element('label');
    const input = element('input', { type: 'radio', name: 'graph-theme', value: name });
    input.addEventListener('change', () => {
      if (input.checked) emit('theme', name);
    });
    label.append(input, element('span', { text: name === 'black' ? 'OLED black' : 'Charcoal' }));
    themeControl.append(label);
    controls.set(`theme:${name}`, { input, definition: schema.theme });
  }
  theme.body.append(themeControl);

  const footer = element('div', { className: 'settings-footer' });
  const reset = element('button', { className: 'reset-settings', type: 'button', text: 'Reset to defaults' });
  reset.addEventListener('click', () => onReset?.());
  footer.append(reset);

  content.append(filters.details, groups.details, display.details, forces.details, theme.details, footer);
  panel.append(header, content);
  root.replaceChildren(toggle, panel);

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    searchInput.setAttribute('aria-expanded', String(open && searchItems.length > 0));
    if (open) searchInput.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      toggle.focus();
    }
  });

  function renderKinds() {
    kindControls.replaceChildren();
    if (!currentKinds.length) return;

    kindControls.append(element('p', { className: 'control-caption', text: 'Node kinds' }));
    const hidden = new Set(current.hiddenKinds.map(normalizedKind));
    for (const kind of currentKinds) {
      const normalized = normalizedKind(kind);
      const row = element('label', { className: 'kind-filter' });
      const input = element('input', { type: 'checkbox', value: normalized });
      input.checked = !hidden.has(normalized);
      const swatch = element('span', { className: 'kind-swatch', 'aria-hidden': 'true' });
      swatch.style.background = kindColors[normalized] || kindColors.unknown;
      swatch.dataset.shape = nodeKindShape({ kind: normalized });
      input.addEventListener('change', () => {
        const next = new Set(current.hiddenKinds.map(normalizedKind));
        if (input.checked) next.delete(normalized);
        else next.add(normalized);
        emit('hiddenKinds', [...next]);
      });
      row.append(input, swatch, element('span', { text: kind }));
      kindControls.append(row);
    }
  }

  function renderCodeSets() {
    codeSetControls.replaceChildren();
    if (!currentCodeSets.length) return;

    codeSetControls.append(
      element('p', { className: 'control-caption', text: 'Code sets' }),
      element('p', {
        className: 'control-help',
        text: 'Path-derived. Ambiguous paths remain Unknown; all sets are visible by default.',
      }),
    );
    const hidden = new Set(current.hiddenCodeSets || []);
    for (const { id, label, count } of currentCodeSets) {
      const row = element('label', { className: 'code-set-filter' });
      const input = element('input', { type: 'checkbox', value: id });
      input.checked = !hidden.has(id);
      input.addEventListener('change', () => {
        const next = new Set(current.hiddenCodeSets || []);
        if (input.checked) next.delete(id);
        else next.add(id);
        emit('hiddenCodeSets', [...next]);
      });
      row.append(
        input,
        element('span', { text: label }),
        element('strong', { text: Number(count || 0).toLocaleString() }),
      );
      codeSetControls.append(row);
    }
  }

  function renderRelations() {
    relationControls.replaceChildren();
    relationControls.hidden = currentContext.view !== 'filedeps';
    if (relationControls.hidden) return;

    relationControls.append(
      element('p', { className: 'control-caption', text: 'Dependency evidence' }),
      element('p', {
        className: 'control-help',
        text: 'Filters compose locally. Evidence subsets follow the remaining visible relations.',
      }),
    );
    const fileDirection = element('fieldset', {
      className: 'query-choice file-direction',
      'aria-describedby': 'file-direction-help',
    });
    fileDirection.disabled = !currentContext.selectedId;
    fileDirection.append(element('legend', { text: 'Selected file direction' }));
    const fileDirectionOptions = element('div', { className: 'query-segment' });
    const activeDirection = ['incoming', 'outgoing'].includes(currentContext.fileDirection)
      ? currentContext.fileDirection
      : 'both';
    for (const [value, label] of [['incoming', 'Incoming'], ['both', 'Both'], ['outgoing', 'Outgoing']]) {
      const option = element('label');
      const input = element('input', { type: 'radio', name: 'file-direction', value });
      input.checked = value === activeDirection;
      input.addEventListener('change', () => {
        if (input.checked) onQueryChange?.('fileDirection', value);
      });
      option.append(input, element('span', { text: label }));
      fileDirectionOptions.append(option);
    }
    fileDirection.append(
      fileDirectionOptions,
      element('p', {
        id: 'file-direction-help',
        className: 'control-help',
        text: currentContext.selectedId
          ? 'Direct loaded relationships relative to the selected file.'
          : 'Select a file to filter direct dependency evidence.',
      }),
    );
    relationControls.append(fileDirection);
    const evidence = element('label', { className: 'evidence-control', for: 'file-evidence' });
    evidence.append(element('span', { text: 'Files' }));
    const evidenceSelect = element('select', { id: 'file-evidence', 'aria-label': 'File evidence' });
    evidenceSelect.append(
      element('option', { value: 'all', text: 'Coupling landscape' }),
      element('option', { value: 'cycles', text: 'Cycle members' }),
      element('option', { value: 'isolated', text: 'Isolated files' }),
    );
    evidenceSelect.value = ['cycles', 'isolated'].includes(currentContext.fileEvidence)
      ? currentContext.fileEvidence
      : 'all';
    evidenceSelect.addEventListener('change', () => onQueryChange?.('fileEvidence', evidenceSelect.value));
    evidence.append(evidenceSelect);
    relationControls.append(evidence);
    if (evidenceSelect.value === 'all') {
      const minimumCoupling = Math.min(100, Math.max(0, Math.floor(Number(currentContext.minCouplingPercentile) || 0)));
      const couplingThreshold = element('div', { className: 'range-control coupling-threshold' });
      const couplingLabel = element('label', { for: 'file-coupling-percentile' });
      const couplingOutput = element('output', { for: 'file-coupling-percentile' });
      const couplingInput = element('input', {
        id: 'file-coupling-percentile', type: 'range', min: 0, max: 100, step: 5, value: minimumCoupling,
      });
      couplingOutput.value = minimumCoupling === 0 ? 'All' : `P${minimumCoupling}+`;
      updateRangeFill(couplingInput, { min: 0, max: 100 });
      couplingLabel.append(element('span', { text: 'Minimum coupling percentile' }), couplingOutput);
      couplingInput.addEventListener('input', () => {
        const value = Number(couplingInput.value);
        couplingOutput.value = value === 0 ? 'All' : `P${value}+`;
        updateRangeFill(couplingInput, { min: 0, max: 100 });
      });
      couplingInput.addEventListener('change', () => {
        onQueryChange?.('minCouplingPercentile', Number(couplingInput.value));
      });
      couplingThreshold.append(couplingLabel, couplingInput);
      relationControls.append(couplingThreshold);
    }
    if (!currentRelations.length) return;
    relationControls.append(
      element('p', { className: 'control-caption relation-kind-caption', text: 'Relation kinds' }),
      element('p', { className: 'control-help', text: 'Exact raw kinds and loaded weights.' }),
    );
    const minimum = Math.max(1, Math.floor(Number(currentContext.minRelationWeight) || 1));
    const maximum = Math.max(minimum, Math.floor(Number(currentContext.maxRelationWeight) || 1));
    const threshold = element('div', { className: 'range-control relation-threshold' });
    const thresholdLabel = element('label', { for: 'file-relation-weight' });
    const thresholdOutput = element('output', { for: 'file-relation-weight' });
    const thresholdInput = element('input', {
      id: 'file-relation-weight', type: 'range', min: 1, max: maximum, step: 1, value: minimum,
    });
    thresholdOutput.value = minimum.toLocaleString();
    updateRangeFill(thresholdInput, { min: 1, max: maximum });
    thresholdLabel.append(element('span', { text: 'Minimum edge weight' }), thresholdOutput);
    thresholdInput.addEventListener('input', () => {
      thresholdOutput.value = Number(thresholdInput.value).toLocaleString();
      updateRangeFill(thresholdInput, { min: 1, max: maximum });
    });
    thresholdInput.addEventListener('change', () => {
      onQueryChange?.('minRelationWeight', Number(thresholdInput.value));
    });
    threshold.append(thresholdLabel, thresholdInput);
    relationControls.append(threshold);
    const hidden = new Set((current.hiddenRelationKinds ?? []).map(normalizedKind));
    for (const relation of currentRelations) {
      const row = element('label', { className: 'relation-filter' });
      const input = element('input', { type: 'checkbox', value: relation.id });
      input.checked = !hidden.has(relation.id);
      input.addEventListener('change', () => {
        const next = new Set((current.hiddenRelationKinds ?? []).map(normalizedKind));
        if (input.checked) next.delete(relation.id);
        else next.add(relation.id);
        emit('hiddenRelationKinds', [...next]);
      });
      row.append(
        input,
        element('span', { text: relation.label }),
        element('strong', { text: relation.weight.toLocaleString() }),
      );
      relationControls.append(row);
    }
  }

  function renderSearchResults(results, status = null) {
    searchResults.replaceChildren();
    searchItems = [...results];
    activeSearchIndex = -1;
    searchInput.removeAttribute('aria-activedescendant');
    searchResults.hidden = !searchItems.length;
    searchInput.setAttribute('aria-expanded', String(!panel.hidden && searchItems.length > 0));
    searchStatus.textContent = status ?? (results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'No matches');
    for (const [index, result] of results.entries()) {
      const button = element('button', {
        className: 'search-result',
        id: `graph-search-option-${index}`,
        type: 'button',
        role: 'option',
        'aria-selected': 'false',
        tabindex: '-1',
      });
      button.append(
        element('span', { className: 'search-result-label', text: result.label || result.id }),
        element('span', {
          className: 'search-result-meta',
          text: [result.kind, result.file].filter(Boolean).join(' · '),
        }),
      );
      button.addEventListener('click', () => {
        activateSearchResult(index);
      });
      searchResults.append(button);
    }
  }

  function clearSearchResults() {
    searchItems = [];
    activeSearchIndex = -1;
    searchResults.replaceChildren();
    searchResults.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    searchInput.removeAttribute('aria-activedescendant');
  }

  function showRecentSymbols() {
    if (searchInput.value.trim()) return;
    const recent = Array.isArray(currentContext.recentSymbols) ? currentContext.recentSymbols : [];
    if (recent.length) renderSearchResults(recent, 'Recent symbols');
    else {
      clearSearchResults();
      searchStatus.textContent = '';
    }
  }

  function setActiveSearchIndex(index) {
    activeSearchIndex = index;
    const options = [...searchResults.querySelectorAll('[role="option"]')];
    for (const [optionIndex, option] of options.entries()) {
      option.setAttribute('aria-selected', String(optionIndex === index));
    }
    const active = options[index];
    if (!active) {
      searchInput.removeAttribute('aria-activedescendant');
      return;
    }
    searchInput.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  }

  function activateSearchResult(index) {
    const result = searchItems[index];
    if (!result) return;
    onSelectSearch?.(result);
    clearSearchResults();
    searchInput.value = '';
    searchStatus.textContent = `Focused ${result.label || result.id}`;
  }

  searchInput.addEventListener('focus', showRecentSymbols);

  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    searchSequence += 1;
    const sequence = searchSequence;
    clearSearchResults();
    if (query.length < 2) {
      if (!query) showRecentSymbols();
      else searchStatus.textContent = 'Type at least 2 characters';
      return;
    }
    searchStatus.textContent = 'Searching…';
    searchTimer = window.setTimeout(async () => {
      try {
        const results = await onSearch?.(query);
        if (sequence === searchSequence) renderSearchResults(results || []);
      } catch (error) {
        if (sequence === searchSequence && error?.name !== 'AbortError') {
          searchStatus.textContent = 'Search unavailable';
        }
      }
    }, 180);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && searchItems.length) {
      event.preventDefault();
      event.stopPropagation();
      setActiveSearchIndex(searchIndexAfterKey(activeSearchIndex, searchItems.length, event.key));
      return;
    }
    if (event.key === 'Enter' && activeSearchIndex >= 0) {
      event.preventDefault();
      event.stopPropagation();
      activateSearchResult(activeSearchIndex);
      return;
    }
    if (event.key === 'Escape' && searchItems.length) {
      event.preventDefault();
      event.stopPropagation();
      clearSearchResults();
      searchStatus.textContent = '';
    }
  });

  function update(nextSettings, nextContext = {}) {
    current = nextSettings;
    currentContext = { ...currentContext, ...nextContext };
    for (const [key, control] of controls) {
      if (key.startsWith('theme:')) {
        control.input.checked = key.slice(6) === current.theme;
      } else if (key.startsWith('choice:')) {
        const [, settingKey, value] = key.split(':');
        control.input.checked = current[settingKey] === value;
      } else if (control.definition.type === 'boolean') {
        control.input.checked = Boolean(current[key]);
      } else if (control.definition.type === 'range') {
        control.input.value = current[key];
        control.readout.value = formatValue(current[key], control.definition);
        updateRangeFill(control.input, control.definition);
      }
    }
    if (nextContext.kinds) {
      currentKinds = [...new Set(nextContext.kinds.map(String))].sort((a, b) => a.localeCompare(b));
    }
    if (nextContext.codeSets) currentCodeSets = [...nextContext.codeSets];
    if (nextContext.relations) currentRelations = [...nextContext.relations];
    callQuery.hidden = currentContext.view !== 'callgraph' || !currentContext.focus;
    const usesPhysics = currentContext.usesPhysics !== false;
    forces.details.hidden = !usesPhysics;
    const motionControl = controls.get('animate');
    if (motionControl?.row) motionControl.row.hidden = !usesPhysics;
    const direction = ['callers', 'both', 'callees'].includes(currentContext.callDirection)
      ? currentContext.callDirection
      : 'both';
    const directionInput = directionOptions.querySelector(`input[value="${direction}"]`);
    if (directionInput) directionInput.checked = true;
    depthInput.value = Math.min(5, Math.max(1, Math.trunc(Number(currentContext.callDepth) || 2)));
    updateDepthReadout();
    renderKinds();
    renderCodeSets();
    renderRelations();
    if (!panel.hidden && !searchInput.value.trim()) showRecentSymbols();
  }

  update(settings, context);
  return { close: () => setOpen(false), open: () => setOpen(true), update };
}
