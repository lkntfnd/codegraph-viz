const CORE_FORCES = ['centerForce', 'repelForce', 'linkForce', 'linkDistance'];
const ADVANCED_FORCES = ['collidePad', 'velocityDecay', 'alphaDecay'];
const DISPLAY_CONTROLS = [
  'showLabels',
  'labelZoom',
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
  kindColors,
  onChange,
  onReset,
  onSearch,
  onSelectSearch,
}) {
  if (!root) throw new TypeError('createPanel requires a root element');

  let current = settings;
  let currentKinds = [];
  let searchTimer = null;
  let searchSequence = 0;
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
    element('p', { text: 'Tune this field, not the data.' }),
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
    placeholder: 'Type a function or class…',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const searchStatus = element('div', { className: 'search-status', 'aria-live': 'polite' });
  const searchResults = element('div', { className: 'search-results', role: 'listbox' });
  searchWrap.append(searchLabel, searchInput, searchStatus, searchResults);
  filters.body.append(searchWrap);

  const kindControls = element('div', { className: 'kind-controls' });
  filters.body.append(kindControls);

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
    controls.set(key, { input, definition });
    return row;
  }

  filters.body.append(makeBoolean('showExternal'));

  const groups = section('Groups', { open: false });
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

  const display = section('Display');
  for (const key of DISPLAY_CONTROLS) {
    display.body.append(schema[key].type === 'range' ? makeRange(key) : makeBoolean(key));
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

  function renderSearchResults(results) {
    searchResults.replaceChildren();
    searchStatus.textContent = results.length ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'No matches';
    for (const result of results) {
      const button = element('button', { className: 'search-result', type: 'button', role: 'option' });
      button.append(
        element('span', { className: 'search-result-label', text: result.label || result.id }),
        element('span', {
          className: 'search-result-meta',
          text: [result.kind, result.file].filter(Boolean).join(' · '),
        }),
      );
      button.addEventListener('click', () => {
        onSelectSearch?.(result);
        searchResults.replaceChildren();
        searchStatus.textContent = `Focused ${result.label || result.id}`;
      });
      searchResults.append(button);
    }
  }

  searchInput.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    searchSequence += 1;
    const sequence = searchSequence;
    searchResults.replaceChildren();
    if (query.length < 2) {
      searchStatus.textContent = query ? 'Type at least 2 characters' : '';
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

  function update(nextSettings, { kinds } = {}) {
    current = nextSettings;
    for (const [key, control] of controls) {
      if (key.startsWith('theme:')) {
        control.input.checked = key.slice(6) === current.theme;
      } else if (control.definition.type === 'boolean') {
        control.input.checked = Boolean(current[key]);
      } else if (control.definition.type === 'range') {
        control.input.value = current[key];
        control.readout.value = formatValue(current[key], control.definition);
        updateRangeFill(control.input, control.definition);
      }
    }
    if (kinds) currentKinds = [...new Set(kinds.map(String))].sort((a, b) => a.localeCompare(b));
    renderKinds();
  }

  update(settings);
  return { close: () => setOpen(false), open: () => setOpen(true), update };
}
