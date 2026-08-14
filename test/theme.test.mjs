import assert from 'node:assert/strict';
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
];

test('dark and black themes expose the same complete canvas token contract', () => {
  assert.deepEqual(Object.keys(THEMES.dark), REQUIRED_TOKENS);
  assert.deepEqual(Object.keys(THEMES.black), REQUIRED_TOKENS);
  assert.equal(THEMES.dark.bg, '#0c0f13');
  assert.equal(THEMES.black.bg, '#000000');
  assert.equal(THEMES.dark.linkHi, '#38e1c6');
  assert.equal(THEMES.black.linkHi, '#38e1c6');
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
