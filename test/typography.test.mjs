import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS block for ${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
}

test('interface typography defines control, metadata, and caption floors', () => {
  assert.match(css, /--type-control:\s*13px;/);
  assert.match(css, /--type-meta:\s*12px;/);
  assert.match(css, /--type-caption:\s*11px;/);
});

test('CSS contains no interface font size below the 11px tertiary floor', () => {
  const undersized = [...css.matchAll(/font-size:\s*([\d.]+)px/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size < 11);
  assert.deepEqual(undersized, []);
});

test('primary interactive text uses the 13px control role', () => {
  for (const selector of [
    '.tab',
    '.layout-control select',
    '.settings-toggle',
    '.search-control input[type="search"]',
    '.query-segment span',
    '.control-label',
    '.reset-settings',
  ]) {
    assert.match(block(selector), /font-size:\s*var\(--type-control\)/, selector);
  }
});

test('compact breakpoints never shrink mode or layout controls', () => {
  const compact = css.slice(css.indexOf('@media (max-width: 760px)'));
  const declarations = [...compact.matchAll(/font-size:\s*([^;]+);/g)]
    .map((match) => match[1].trim());
  assert.equal(declarations.some((value) => /(?:8|9|10)px/.test(value)), false);
});

test('caller and callee direction stays on one semantic row', () => {
  assert.match(css, /\.impact-key\s*{[^}]*white-space:\s*nowrap;/);
});

test('compact graph and inspector actions expose 44px touch targets', () => {
  const compact = css.slice(css.indexOf('@media (max-width: 760px)'));
  for (const selector of [
    '.layout-control select',
    '.settings-toggle',
    '.inspector-actions button',
    '.inspector-relations button',
  ]) {
    assert.match(compact, new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{}]*{[^}]*?(?:min-)?height:\\s*44px;`), selector);
  }
  for (const selector of ['.tool-button', '.inspector-close']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(compact, new RegExp(`${escaped}\\s*{[^}]*width:\\s*44px;[^}]*height:\\s*44px;`), selector);
  }
  assert.match(compact, /\.inspector-center,\s*\.inspector-disclosure\s*{[^}]*min-height:\s*44px;/);
  assert.match(compact, /\.workspace:has\(\.selection-inspector:not\(\[hidden\]\)\) \.graph-toolbar,[\s\S]*?bottom:\s*calc\(48% \+ 9px\);/);
});

test('compact Controls expose 44px effective touch rows', () => {
  const compact = css.slice(css.indexOf('@media (max-width: 760px)'));
  for (const selector of [
    '.panel-section > summary',
    '.search-control input[type="search"]',
    '.query-segment span',
    '.kind-filter',
    '.code-set-filter',
    '.relation-filter',
    '.switch-row',
    '.evidence-control select',
    '.range-control input[type="range"]',
    '.advanced-forces > summary',
    '.theme-control span',
    '.reset-settings',
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(compact, new RegExp(`${escaped}[^{}]*{[^}]*?(?:min-)?height:\\s*44px;`), selector);
  }
  assert.match(compact, /\.panel-close\s*{[^}]*width:\s*44px;[^}]*height:\s*44px;/);
});
