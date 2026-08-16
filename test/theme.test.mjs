import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { THEMES, apply } from '../public/app/theme.js';

const REQUIRED_TOKENS = [
  'bg',
  'bgPanel',
  'line',
  'text',
  'muted',
  'link',
  'linkHi',
  'nodeStroke',
  'glow',
  'inbound',
  'outbound',
  'bidirectional',
  'focus',
];

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('dark and black themes expose the same complete canvas token contract', () => {
  assert.deepEqual(Object.keys(THEMES.dark), REQUIRED_TOKENS);
  assert.deepEqual(Object.keys(THEMES.black), REQUIRED_TOKENS);
  assert.equal(THEMES.dark.bg, '#0c0f13');
  assert.equal(THEMES.black.bg, '#000000');
  assert.equal(THEMES.dark.linkHi, '#38e1c6');
  assert.equal(THEMES.black.linkHi, '#38e1c6');
  assert.equal(THEMES.dark.inbound, '#73a9ff');
  assert.equal(THEMES.dark.outbound, '#f0b55b');
  assert.equal(THEMES.dark.bidirectional, '#ab92f5');
});

test('muted normal text clears WCAG AA on every theme surface', () => {
  for (const [name, theme] of Object.entries(THEMES)) {
    assert.ok(contrastRatio(theme.muted, theme.bg) >= 4.5, `${name} muted text on graph background`);
    assert.ok(contrastRatio(theme.muted, theme.bgPanel) >= 4.5, `${name} muted text on panel background`);
  }
});

test('CSS fallback muted token matches the default dark theme', () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, new RegExp(`--muted:\\s*${THEMES.dark.muted};`));
});

test('apply writes matching CSS tokens without depending on document globals', () => {
  const properties = new Map();
  const root = {
    dataset: {},
    style: { setProperty: (name, value) => properties.set(name, value) },
  };

  const active = apply('black', root);

  assert.equal(active, THEMES.black);
  assert.equal(root.dataset.theme, 'black');
  assert.equal(properties.get('--bg'), '#000000');
  assert.equal(properties.get('--bg-panel'), '#0a0a0a');
  assert.equal(properties.get('--node-stroke'), 'rgba(255,255,255,.06)');
});

test('apply falls back to dark for an unknown theme', () => {
  assert.equal(apply('paper'), THEMES.dark);
});

test('every stylesheet custom property reference has a definition', () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const definitions = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map((match) => match[1]));
  const references = new Set([...css.matchAll(/var\(--([\w-]+)/g)].map((match) => match[1]));

  assert.deepEqual([...references].filter((name) => !definitions.has(name)).sort(), []);
});
