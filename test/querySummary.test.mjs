import assert from 'node:assert/strict';
import test from 'node:test';

import { fileDependencyFilterSummary, graphFilterSummary } from '../public/app/querySummary.js';

test('file dependency summary stays absent for the default coupling landscape', () => {
  assert.equal(fileDependencyFilterSummary({}), null);
  assert.equal(fileDependencyFilterSummary({
    fileEvidence: 'all', minRelationWeight: 1, minCouplingPercentile: 0,
  }), null);
});

test('file dependency summary names active semantic filters in stable order', () => {
  assert.deepEqual(fileDependencyFilterSummary({
    hiddenRelationKinds: ['references', ' Calls ', 'imports'],
    minRelationWeight: 4,
    fileEvidence: 'cycles',
    minCouplingPercentile: 90,
  }), {
    short: 'Cycle members · weight ≥ 4 · without calls, imports +1',
    label: 'Active filters: Cycle members; minimum edge weight 4; excluding calls, imports, references',
  });
});

test('coupling and isolation evidence have explicit concise summaries', () => {
  assert.equal(fileDependencyFilterSummary({
    fileEvidence: 'all', minCouplingPercentile: 90,
  }).short, 'P90+ coupling');
  assert.equal(fileDependencyFilterSummary({
    fileEvidence: 'isolated', minCouplingPercentile: 90,
  }).short, 'Isolated files');
});

test('graph summary exposes hidden node kinds and external visibility in every mode', () => {
  assert.equal(graphFilterSummary({ view: 'architecture', settings: {} }), null);
  assert.deepEqual(graphFilterSummary({
    view: 'architecture',
    settings: { hiddenKinds: [' Folder ', 'file', 'folder'], showExternal: true },
  }), {
    short: 'without kinds: file, folder',
    label: 'Active filters: excluding node kinds file, folder',
  });
  assert.deepEqual(graphFilterSummary({
    view: 'callgraph',
    settings: { hiddenKinds: [], showExternal: false },
  }), {
    short: 'internal only',
    label: 'Active filters: excluding external nodes',
  });
});

test('graph summary composes File-dependency and display filters without ambiguity', () => {
  assert.deepEqual(graphFilterSummary({
    view: 'filedeps',
    fileEvidence: 'cycles',
    hiddenRelationKinds: ['calls'],
    minRelationWeight: 4,
    settings: { hiddenKinds: ['file'], showExternal: false },
  }), {
    short: 'Cycle members · weight ≥ 4 · without calls · without kinds: file · internal only',
    label: 'Active filters: Cycle members; minimum edge weight 4; excluding calls; excluding node kinds file; excluding external nodes',
  });
});

test('graph summary names excluded code sets separately from node kinds', () => {
  assert.deepEqual(graphFilterSummary({
    view: 'architecture',
    settings: {
      hiddenKinds: ['file'],
      hiddenCodeSets: ['unknown', 'tests', 'invalid'],
      showExternal: true,
    },
  }), {
    short: 'without kinds: file · without sets: tests, unknown',
    label: 'Active filters: excluding node kinds file; excluding code sets tests, unknown',
  });
});

test('graph summary names active selected-file direction without implying transitive impact', () => {
  assert.deepEqual(graphFilterSummary({
    view: 'filedeps',
    selectedId: 'src/services/auth.mjs',
    fileDirection: 'incoming',
    settings: {},
  }), {
    short: 'Incoming to auth.mjs',
    label: 'Active filters: direct incoming dependencies to src/services/auth.mjs',
  });
  assert.deepEqual(graphFilterSummary({
    view: 'filedeps',
    selectedId: 'src\\repositories\\user.mjs',
    fileDirection: 'outgoing',
    settings: {},
  }), {
    short: 'Outgoing from user.mjs',
    label: 'Active filters: direct outgoing dependencies from src/repositories/user.mjs',
  });
  assert.equal(graphFilterSummary({
    view: 'filedeps', selectedId: 'file-a', fileDirection: 'both', settings: {},
  }), null);
  assert.equal(graphFilterSummary({
    view: 'filedeps', selectedId: null, fileDirection: 'incoming', settings: {},
  }), null);
});
