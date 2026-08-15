import { CODE_SETS } from './codeSet.js';

export const SETTINGS_STORAGE_KEY = 'cgviz.settings.v1';

export const GRAPH_CONSTANTS = Object.freeze({
  BASE_R: 3,
  R_SCALE: 1.6,
  R_MIN: 3,
  R_MAX: 26,
  MASS_SCALE: 0.6,
});

export const SCHEMA = Object.freeze({
  centerForce: {
    type: 'range', group: 'forces', label: 'Center force',
    default: 0.05, min: 0, max: 0.3, step: 0.01,
  },
  repelForce: {
    type: 'range', group: 'forces', label: 'Repel force',
    default: -220, min: -800, max: -30, step: 10,
  },
  linkForce: {
    type: 'range', group: 'forces', label: 'Link force',
    default: 0.35, min: 0, max: 1, step: 0.05,
  },
  linkDistance: {
    type: 'range', group: 'forces', label: 'Link distance',
    default: 55, min: 10, max: 260, step: 5,
  },
  collidePad: {
    type: 'range', group: 'forces', label: 'Collision space',
    default: 2, min: 0, max: 12, step: 1,
  },
  velocityDecay: {
    type: 'range', group: 'forces', label: 'Friction',
    default: 0.35, min: 0.1, max: 0.9, step: 0.01,
  },
  alphaDecay: {
    type: 'range', group: 'forces', label: 'Settle speed',
    default: 0.0228, min: 0.005, max: 0.1, step: 0.001,
  },
  nodeSize: {
    type: 'range', group: 'display', label: 'Node size',
    default: 1, min: 0.5, max: 2, step: 0.05,
  },
  linkThickness: {
    type: 'range', group: 'display', label: 'Link thickness',
    default: 1, min: 0.5, max: 3, step: 0.1,
  },
  labelZoom: {
    type: 'range', group: 'display', label: 'Label reveal',
    default: 0, min: 0, max: 1, step: 0.05,
  },
  labelSize: {
    type: 'range', group: 'display', label: 'Text size',
    default: 13, min: 10, max: 24, step: 1,
  },
  labelDensity: {
    type: 'enum', group: 'display', label: 'Label density',
    default: 'balanced', values: ['minimal', 'balanced', 'dense'],
  },
  showLabels: {
    type: 'boolean', group: 'display', label: 'Show labels', default: true,
  },
  showExternal: {
    type: 'boolean', group: 'filters', label: 'External nodes', default: true,
  },
  animate: {
    type: 'boolean', group: 'display', label: 'Keep moving', default: false,
  },
  curvedLinks: {
    type: 'boolean', group: 'display', label: 'Curved links', default: false,
  },
  hiddenKinds: {
    type: 'stringArray', group: 'filters', label: 'Hidden kinds', default: [],
  },
  hiddenCodeSets: {
    type: 'enumArray', group: 'filters', label: 'Hidden code sets', default: [], values: CODE_SETS,
  },
  hiddenRelationKinds: {
    type: 'stringArray', group: 'filters', label: 'Hidden relation kinds', default: [],
  },
  theme: {
    type: 'enum', group: 'theme', label: 'Theme', default: 'dark', values: ['dark', 'black'],
  },
});

function cloneDefault(definition) {
  return Array.isArray(definition.default) ? [...definition.default] : definition.default;
}

function defaults() {
  return Object.fromEntries(
    Object.entries(SCHEMA).map(([key, definition]) => [key, cloneDefault(definition)]),
  );
}

export const DEFAULTS = Object.freeze(defaults());

export function clamp(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const output = {};

  for (const [key, definition] of Object.entries(SCHEMA)) {
    const value = Object.hasOwn(source, key) ? source[key] : cloneDefault(definition);

    if (definition.type === 'range') {
      const numeric = Number(value);
      output[key] = Number.isFinite(numeric)
        ? Math.min(definition.max, Math.max(definition.min, numeric))
        : definition.default;
    } else if (definition.type === 'boolean') {
      output[key] = Boolean(value);
    } else if (definition.type === 'enum') {
      output[key] = definition.values.includes(value) ? value : definition.default;
    } else if (definition.type === 'stringArray') {
      output[key] = Array.isArray(value)
        ? [...new Set(value.filter((item) => typeof item === 'string'))]
        : [...definition.default];
    } else if (definition.type === 'enumArray') {
      const selected = new Set((Array.isArray(value) ? value : [])
        .map((item) => typeof item === 'string' ? item.trim().toLowerCase() : '')
        .filter(Boolean));
      output[key] = definition.values.filter((item) => selected.has(item));
    }
  }

  return output;
}

export function serialize(settings) {
  return JSON.stringify(clamp(settings));
}

export function deserialize(serialized) {
  try {
    return clamp(JSON.parse(serialized));
  } catch {
    return clamp(DEFAULTS);
  }
}
