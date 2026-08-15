import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODE_SETS,
  classifyCodeSet,
  codeSetPath,
  filterGraphByCodeSets,
  summarizeCodeSets,
} from '../public/app/codeSet.js';

test('code-set classification recognizes only explicit path evidence', () => {
  assert.deepEqual(CODE_SETS, ['production', 'tests', 'generated', 'vendor', 'unknown']);
  assert.equal(classifyCodeSet('src/main.js'), 'production');
  assert.equal(classifyCodeSet('packages/core/src/index.ts'), 'production');
  assert.equal(classifyCodeSet('test/server.test.mjs'), 'tests');
  assert.equal(classifyCodeSet('src/services/auth.spec.ts'), 'tests');
  assert.equal(classifyCodeSet('src/__generated__/schema.ts'), 'generated');
  assert.equal(classifyCodeSet('api/client.generated.ts'), 'generated');
  assert.equal(classifyCodeSet('vendor/d3.js'), 'vendor');
  assert.equal(classifyCodeSet('node_modules/d3/index.js'), 'vendor');
});

test('vendor and generated evidence outrank test-looking filenames', () => {
  assert.equal(classifyCodeSet('src/vendor/library.test.js'), 'vendor');
  assert.equal(classifyCodeSet('src/generated/client.spec.ts'), 'generated');
});

test('ambiguous paths stay visibly unknown instead of becoming production', () => {
  assert.equal(classifyCodeSet('scripts/release.mjs'), 'unknown');
  assert.equal(classifyCodeSet('docs/test/guide.md'), 'unknown');
  assert.equal(classifyCodeSet('contest.ts'), 'unknown');
  assert.equal(classifyCodeSet(''), 'unknown');
  assert.equal(classifyCodeSet(null), 'unknown');
});

test('code-set paths normalize Windows separators and node path fallback', () => {
  assert.equal(codeSetPath({ path: '.\\tests\\unit\\thing.ts' }), 'tests/unit/thing.ts');
  assert.equal(codeSetPath({ path: '', file: 'src\\thing.ts' }), 'src/thing.ts');
  assert.equal(classifyCodeSet({ path: 'SRC\\Thing.ts' }), 'production');
  assert.equal(classifyCodeSet({ file: 'pkg\\thing_test.go' }), 'tests');
});

test('code-set filtering removes excluded nodes and every incident edge defensively', () => {
  const data = {
    nodes: [
      { id: 'source', path: 'src/main.ts' },
      { id: 'test', path: 'test/main.test.ts' },
      { id: 'vendor', path: 'vendor/lib.ts' },
      { id: 'unknown', path: 'scripts/release.mjs' },
    ],
    edges: [
      { source: 'source', target: 'test' },
      { source: 'test', target: 'vendor' },
      { source: 'unknown', target: 'source' },
    ],
  };
  const filtered = filterGraphByCodeSets(data, [' Vendor ', 'unknown', 'invalid']);

  assert.deepEqual(filtered.nodes.map((node) => node.id), ['source', 'test']);
  assert.deepEqual(filtered.edges, [{ source: 'source', target: 'test' }]);
  assert.notEqual(filtered.nodes, data.nodes);
  assert.equal(data.nodes.length, 4);
  assert.equal(data.edges.length, 3);
});

test('code-set summary reports all explicit buckets in stable display order', () => {
  assert.deepEqual(summarizeCodeSets([
    { path: 'test/a.test.ts' },
    { path: 'src/a.ts' },
    { path: 'scripts/a.mjs' },
    { path: 'src/b.ts' },
  ]), [
    { id: 'production', label: 'Production', count: 2 },
    { id: 'tests', label: 'Tests', count: 1 },
    { id: 'generated', label: 'Generated', count: 0 },
    { id: 'vendor', label: 'Vendor', count: 0 },
    { id: 'unknown', label: 'Unknown', count: 1 },
  ]);
});
