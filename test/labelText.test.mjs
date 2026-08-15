import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canvasLabelMaxWidth, fitCanvasLabel } from '../public/app/labelText.js';

const fixedMeasure = (value) => [...String(value)].length * 10;

test('canvas label width stays bounded without changing labels that already fit', () => {
  assert.equal(fitCanvasLabel('shortName', fixedMeasure, 100), 'shortName');
  assert.equal(fitCanvasLabel('abcdefghijklmnopqrst', fixedMeasure, 90), 'abcd…qrst');
  assert.ok(fixedMeasure(fitCanvasLabel('abcdefghijklmnopqrst', fixedMeasure, 90)) <= 90);
});

test('middle truncation preserves valid graphemes and leaves source text untouched', () => {
  const source = 'handler👩🏽‍💻ForExtremelyLongLocalizedName終端';
  const fitted = fitCanvasLabel(source, fixedMeasure, 140);

  assert.equal(source, 'handler👩🏽‍💻ForExtremelyLongLocalizedName終端');
  assert.ok(fitted.includes('…'));
  assert.ok(fixedMeasure(fitted) <= 140);
  assert.doesNotMatch(fitted, /[\uD800-\uDBFF]$/);
});

test('canvas label maximum reserves viewport insets and caps wide labels', () => {
  assert.equal(canvasLabelMaxWidth(1440), 320);
  assert.equal(canvasLabelMaxWidth(375), 320);
  assert.equal(canvasLabelMaxWidth(200), 176);
  assert.equal(canvasLabelMaxWidth(20), 0);
  assert.equal(canvasLabelMaxWidth(Number.NaN), 0);
});
