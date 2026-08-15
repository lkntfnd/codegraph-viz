import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULTS,
  SCHEMA,
  clamp,
  deserialize,
  serialize,
} from '../public/app/settings.js';

const PANEL_CONTROLS = [
  'centerForce',
  'repelForce',
  'linkForce',
  'linkDistance',
  'collidePad',
  'velocityDecay',
  'alphaDecay',
  'nodeSize',
  'linkThickness',
  'labelZoom',
  'labelSize',
  'labelDensity',
  'showLabels',
  'showExternal',
  'animate',
  'curvedLinks',
  'hiddenKinds',
  'hiddenCodeSets',
  'hiddenRelationKinds',
  'theme',
];

test('publishes the documented defaults and ranges as one schema', () => {
  assert.equal(DEFAULTS.centerForce, 0.05);
  assert.equal(DEFAULTS.repelForce, -220);
  assert.equal(DEFAULTS.linkForce, 0.35);
  assert.equal(DEFAULTS.linkDistance, 55);
  assert.equal(DEFAULTS.nodeSize, 1);
  assert.equal(DEFAULTS.linkThickness, 1);
  assert.equal(DEFAULTS.labelZoom, 0);
  assert.equal(SCHEMA.labelZoom.max, 1);
  assert.equal(SCHEMA.labelZoom.label, 'Label reveal');
  assert.equal(DEFAULTS.labelSize, 13);
  assert.equal(DEFAULTS.labelDensity, 'balanced');
  assert.deepEqual(SCHEMA.labelDensity.values, ['minimal', 'balanced', 'dense']);

  for (const key of PANEL_CONTROLS) assert.ok(SCHEMA[key], `missing schema for ${key}`);
  for (const [key, definition] of Object.entries(SCHEMA)) {
    if (definition.type !== 'range') continue;
    assert.ok(definition.default >= definition.min, `${key} default is below min`);
    assert.ok(definition.default <= definition.max, `${key} default is above max`);
  }
});

test('clamps every range and normalizes non-range controls', () => {
  const settings = clamp({
    centerForce: 99,
    repelForce: -9999,
    linkForce: Number.NaN,
    linkDistance: '120',
    nodeSize: 0,
    labelZoom: 9,
    labelSize: 99,
    labelDensity: 'wallpaper',
    showLabels: 0,
    showExternal: false,
    theme: 'sepia',
    hiddenKinds: ['file', 42, 'file', 'function'],
    hiddenCodeSets: [' Vendor ', 'tests', 'vendor', 'invalid', 42],
    hiddenRelationKinds: ['imports', 42, 'imports', 'calls'],
  });

  assert.equal(settings.centerForce, 0.3);
  assert.equal(settings.repelForce, -800);
  assert.equal(settings.linkForce, DEFAULTS.linkForce);
  assert.equal(settings.linkDistance, 120);
  assert.equal(settings.nodeSize, 0.5);
  assert.equal(settings.labelZoom, 1);
  assert.equal(settings.labelSize, 24);
  assert.equal(settings.labelDensity, 'balanced');
  assert.equal(settings.showLabels, false);
  assert.equal(settings.showExternal, false);
  assert.equal(settings.theme, 'dark');
  assert.deepEqual(settings.hiddenKinds, ['file', 'function']);
  assert.deepEqual(settings.hiddenCodeSets, ['tests', 'vendor']);
  assert.deepEqual(settings.hiddenRelationKinds, ['imports', 'calls']);
});

test('serialization round-trips safe settings and drops unknown keys', () => {
  const expected = clamp({
    repelForce: -410,
    theme: 'black',
    showLabels: false,
    hiddenKinds: ['class'],
  });
  const serialized = serialize({ ...expected, injected: '<script>' });

  assert.deepEqual(deserialize(serialized), expected);
  assert.equal(Object.hasOwn(deserialize(serialized), 'injected'), false);
});

test('corrupt persisted settings fall back to fresh defaults', () => {
  const restored = deserialize('{not json');

  assert.deepEqual(restored, DEFAULTS);
  assert.notEqual(restored.hiddenKinds, DEFAULTS.hiddenKinds);
  assert.notEqual(restored.hiddenCodeSets, DEFAULTS.hiddenCodeSets);
  assert.notEqual(restored.hiddenRelationKinds, DEFAULTS.hiddenRelationKinds);
});
