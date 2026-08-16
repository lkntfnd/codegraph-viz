import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

test('reduced motion targets spatial movement without globally killing feedback', () => {
  assert.doesNotMatch(css, /animation-duration:\s*0\.01ms/);
  assert.doesNotMatch(css, /transition-duration:\s*0\.01ms/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.live-dot\.is-loading\s*{[^}]*animation:\s*none;/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.graph-transition\.is-revealing\s*{[^}]*transition:\s*none;/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.loading-spinner\s*{[^}]*animation:\s*none;/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.tab::after\s*{[^}]*transition:\s*opacity\s+130ms\s+ease;/);
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.switch-track::after\s*{[^}]*transition:\s*background\s+120ms\s+ease;/);
});
