import test from 'node:test';
import assert from 'node:assert/strict';

import { truncationLabel, truncationMessage } from '../public/app/scopeStatus.js';

test('truncation message names the exact loaded server scope', () => {
  assert.equal(truncationMessage({
    view: 'filedeps',
    truncated: true,
    scope: { loaded: 600, total: 3_000, limit: 600 },
  }), 'Loaded 600 of 3,000 scoped files · connected externals included');
  assert.equal(truncationMessage({
    view: 'callgraph',
    truncated: true,
    scope: { loaded: 400, total: 2_400, limit: 400 },
  }), 'Loaded top 400 of 2,400 call-connected symbols');
});

test('truncation label keeps exact scope counts compact for the graph readout', () => {
  assert.equal(truncationLabel({
    view: 'filedeps', truncated: true, scope: { loaded: 600, total: 3_000 },
  }), '600 / 3,000 files');
  assert.equal(truncationLabel({
    view: 'callgraph', truncated: true, scope: { loaded: 400, total: 2_400 },
  }), 'Top 400 / 2,400 symbols');
  assert.equal(truncationLabel({ view: 'unknown', truncated: true }), 'Partial server scope');
});

test('truncation message is defensive and absent for complete data', () => {
  assert.equal(truncationMessage({ view: 'filedeps', truncated: false }), null);
  assert.equal(truncationMessage({ view: 'unknown', truncated: true }), 'Loaded scope truncated by server limit');
});
