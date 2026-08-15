import assert from 'node:assert/strict';
import test from 'node:test';

import { callPresentationScope } from '../public/app/callPresentationCopy.js';

const collapsed = [{ hiddenMemberIds: Array.from({ length: 398 }, (_, index) => String(index)) }];

test('large-cycle summary disclosure is identical across both Call layouts', () => {
  for (const layoutId of ['impact-flow', 'radial-reach']) {
    assert.deepEqual(callPresentationScope({ layoutId, collapsedComponents: collapsed }), {
      text: '398 cycle members summarized',
      label: '398 members of a large loaded call cycle are represented by one summary node; loaded counts remain exact',
    });
  }
});

test('selected-path copy distinguishes Radial highlighting from Impact filtering', () => {
  assert.deepEqual(callPresentationScope({
    layoutId: 'radial-reach',
    collapsedComponents: [],
    zoom: 0.5,
    totalLinkCount: 1_000,
    selectedId: 'member',
    focusId: 'focus',
    hasExactPath: true,
  }), {
    text: 'loaded path highlighted',
    label: 'Highlighting one exact loaded path between the selected symbol and focus; other loaded relations remain visible',
  });
  assert.equal(callPresentationScope({
    layoutId: 'impact-flow',
    collapsedComponents: [],
    zoom: 0.5,
    totalLinkCount: 1_000,
    selectedId: 'member',
    focusId: 'focus',
    hasExactPath: true,
  }).text, 'exact loaded path');
  assert.equal(callPresentationScope({
    layoutId: 'impact-flow',
    collapsedComponents: [],
    zoom: 0.5,
    totalLinkCount: 1_000,
    selectedId: 'focus',
    focusId: 'focus',
    hasExactPath: false,
  }).text, 'links sampled at fit');
});
