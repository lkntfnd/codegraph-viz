import assert from 'node:assert/strict';
import test from 'node:test';

import { investigationUrl, parseGraphHash, serializeGraphHash } from '../public/app/urlState.js';

test('call graph hash round-trips semantic investigation state', () => {
  const hash = serializeGraphHash({
    view: 'callgraph',
    layoutId: 'radial-reach',
    prefix: 'ignored',
    file: 'src/auth service.js',
    focus: 'symbol:42',
    callDepth: 4,
    callDirection: 'callers',
    selectedId: 'caller:99',
    fileDirection: 'both',
    hiddenKinds: [],
    hiddenCodeSets: [],
    hiddenRelationKinds: [],
    minRelationWeight: 1,
    fileEvidence: 'all',
    minCouplingPercentile: 0,
  });
  assert.equal(hash, '#view=callgraph&layout=radial-reach&external=1&file=src%2Fauth+service.js&focus=symbol%3A42&depth=4&direction=callers&selected=caller%3A99');
  assert.deepEqual(parseGraphHash(hash), {
    view: 'callgraph',
    layoutId: 'radial-reach',
    prefix: '',
    file: 'src/auth service.js',
    focus: 'symbol:42',
    callDepth: 4,
    callDirection: 'callers',
    selectedId: 'caller:99',
    fileDirection: 'both',
    hiddenKinds: [],
    hiddenCodeSets: [],
    hiddenRelationKinds: [],
    minRelationWeight: 1,
    fileEvidence: 'all',
    minCouplingPercentile: 0,
    showExternal: true,
  });
  assert.equal(
    serializeGraphHash({ view: 'callgraph', focus: 'symbol:42', selectedId: 'symbol:42' }),
    '#view=callgraph&layout=impact-flow&external=1&focus=symbol%3A42&depth=2&direction=both',
  );
  assert.equal(parseGraphHash('#view=callgraph&selected=orphan').selectedId, null);
});

test('architecture hash keeps scope and normalizes invalid fields', () => {
  assert.deepEqual(parseGraphHash('#view=architecture&layout=bad&prefix=src%2Fui&depth=99&direction=bad&focus=nope'), {
    view: 'architecture',
    layoutId: 'nodes',
    prefix: 'src/ui',
    file: null,
    focus: null,
    callDepth: 2,
    callDirection: 'both',
    selectedId: null,
    fileDirection: 'both',
    hiddenKinds: [],
    hiddenCodeSets: [],
    hiddenRelationKinds: [],
    minRelationWeight: 1,
    fileEvidence: 'all',
    minCouplingPercentile: 0,
    showExternal: true,
  });
  assert.equal(serializeGraphHash({ view: 'architecture', layoutId: 'structure-tree', prefix: 'src/ui' }), '#view=architecture&layout=structure-tree&prefix=src%2Fui');
});

test('empty and hostile hashes restore safe defaults', () => {
  const defaults = {
    view: 'architecture',
    layoutId: 'nodes',
    prefix: '',
    file: null,
    focus: null,
    callDepth: 2,
    callDirection: 'both',
    selectedId: null,
    fileDirection: 'both',
    hiddenKinds: [],
    hiddenCodeSets: [],
    hiddenRelationKinds: [],
    minRelationWeight: 1,
    fileEvidence: 'all',
    minCouplingPercentile: 0,
    showExternal: true,
  };
  assert.deepEqual(parseGraphHash(''), defaults);
  assert.deepEqual(parseGraphHash('#view=unknown&focus=%00bad'), defaults);
});

test('file dependency hash round-trips a normalized excluded relation set', () => {
  const hash = serializeGraphHash({
    view: 'filedeps',
    layoutId: 'dependency-matrix',
    prefix: 'src',
    hiddenRelationKinds: [' Imports ', 'calls', 'imports', '', 'type:reference'],
    minRelationWeight: 3,
    fileEvidence: 'isolated',
    minCouplingPercentile: 75,
  });

  assert.equal(hash, '#view=filedeps&layout=dependency-matrix&external=1&prefix=src&hide=calls&hide=imports&hide=type%3Areference&min=3&evidence=isolated');
  assert.deepEqual(parseGraphHash(hash), {
    view: 'filedeps',
    layoutId: 'dependency-matrix',
    prefix: 'src',
    file: null,
    focus: null,
    callDepth: 2,
    callDirection: 'both',
    selectedId: null,
    fileDirection: 'both',
    hiddenKinds: [],
    hiddenCodeSets: [],
    hiddenRelationKinds: ['calls', 'imports', 'type:reference'],
    minRelationWeight: 3,
    fileEvidence: 'isolated',
    minCouplingPercentile: 0,
    showExternal: true,
  });
  assert.deepEqual(
    parseGraphHash('#view=filedeps&hide=%00&hide=%20&hide=CALLS&hide=calls').hiddenRelationKinds,
    ['calls'],
  );
  assert.equal(parseGraphHash('#view=filedeps&min=0').minRelationWeight, 1);
  assert.equal(parseGraphHash('#view=filedeps&min=99999999').minRelationWeight, 1_000_000);
  assert.equal(parseGraphHash('#view=filedeps&evidence=cycles').fileEvidence, 'cycles');
  assert.equal(parseGraphHash('#view=filedeps&evidence=hotspots').fileEvidence, 'all');
  assert.equal(parseGraphHash('#view=filedeps&coupling=75').minCouplingPercentile, 75);
  assert.equal(parseGraphHash('#view=filedeps&coupling=101').minCouplingPercentile, 100);
  assert.equal(
    serializeGraphHash({ view: 'filedeps', fileEvidence: 'all', minCouplingPercentile: 75 }),
    '#view=filedeps&layout=hotspot-landscape&external=1&coupling=75',
  );
});

test('investigation URL copies only the current canonical location parts', () => {
  assert.equal(investigationUrl({
    origin: 'http://127.0.0.1:7700',
    pathname: '/graph',
    search: '?fixture=1',
    hash: '#view=filedeps&layout=dependency-matrix',
  }), 'http://127.0.0.1:7700/graph?fixture=1#view=filedeps&layout=dependency-matrix');
  assert.throws(() => investigationUrl({ origin: 'null' }), /URL is unavailable/);
});

test('external-node visibility is explicit in applicable canonical graph URLs', () => {
  assert.equal(serializeGraphHash({
    view: 'filedeps',
    layoutId: 'hotspot-landscape',
    settings: { showExternal: false },
  }), '#view=filedeps&layout=hotspot-landscape&external=0');
  assert.equal(serializeGraphHash({
    view: 'callgraph',
    layoutId: 'impact-flow',
    settings: { showExternal: true },
  }), '#view=callgraph&layout=impact-flow&external=1');
  assert.equal(parseGraphHash('#view=filedeps&external=0').showExternal, false);
  assert.equal(parseGraphHash('#view=callgraph&external=1').showExternal, true);
  assert.equal(parseGraphHash('#view=filedeps&external=invalid').showExternal, true);
});

test('hidden node kinds round-trip as a bounded canonical set', () => {
  const hash = serializeGraphHash({
    view: 'architecture',
    layoutId: 'territory',
    settings: { hiddenKinds: [' File ', 'folder', 'file', '', 'Type:Generated'] },
  });
  assert.equal(hash, '#view=architecture&layout=nodes&hide-kind=file&hide-kind=folder&hide-kind=type%3Agenerated');
  assert.deepEqual(parseGraphHash(hash).hiddenKinds, ['file', 'folder', 'type:generated']);
  assert.deepEqual(
    parseGraphHash(`#view=architecture&${Array.from({ length: 80 }, (_, index) => `hide-kind=k${index}`).join('&')}`).hiddenKinds,
    Array.from({ length: 80 }, (_, index) => `k${index}`)
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 64),
  );
});

test('hidden code sets round-trip as a canonical known-value set', () => {
  const hash = serializeGraphHash({
    view: 'filedeps',
    layoutId: 'hotspot-landscape',
    settings: { hiddenCodeSets: [' Unknown ', 'tests', 'invalid', 'tests'] },
  });
  assert.equal(hash, '#view=filedeps&layout=hotspot-landscape&external=1&hide-set=tests&hide-set=unknown');
  assert.deepEqual(parseGraphHash(hash).hiddenCodeSets, ['tests', 'unknown']);
});

test('selected File-dependency direction round-trips only with a valid selection', () => {
  const hash = serializeGraphHash({
    view: 'filedeps',
    layoutId: 'dependency-matrix',
    selectedId: 'src/auth service.mjs',
    fileDirection: 'incoming',
  });

  assert.equal(hash, '#view=filedeps&layout=dependency-matrix&external=1&selected=src%2Fauth+service.mjs&file-direction=incoming');
  assert.equal(parseGraphHash(hash).selectedId, 'src/auth service.mjs');
  assert.equal(parseGraphHash(hash).fileDirection, 'incoming');
  assert.equal(
    serializeGraphHash({ view: 'filedeps', selectedId: 'src/auth.mjs', fileDirection: 'both' }),
    '#view=filedeps&layout=hotspot-landscape&external=1',
  );
  assert.equal(
    serializeGraphHash({ view: 'filedeps', fileDirection: 'outgoing' }),
    '#view=filedeps&layout=hotspot-landscape&external=1',
  );
  assert.equal(parseGraphHash('#view=filedeps&file-direction=incoming').fileDirection, 'both');
  assert.equal(parseGraphHash('#view=filedeps&selected=file-a&file-direction=invalid').selectedId, null);
});
