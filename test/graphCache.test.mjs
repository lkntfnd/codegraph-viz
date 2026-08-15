import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCachedPositions,
  createGraphCache,
  graphCacheKey,
} from '../public/app/graphCache.js';

test('graph cache keys are stable and include every request dimension', () => {
  const first = graphCacheKey({
    view: 'callgraph',
    focus: 'symbol:1',
    depth: 3,
    direction: 'callers',
  });
  const reordered = graphCacheKey({
    direction: 'callers',
    depth: 3,
    focus: 'symbol:1',
    view: 'callgraph',
  });

  assert.equal(first, reordered);
  assert.notEqual(first, graphCacheKey({ view: 'callgraph', focus: 'symbol:1', depth: 4, direction: 'callers' }));
  assert.notEqual(first, graphCacheKey({ view: 'callgraph', focus: 'symbol:1', depth: 3, direction: 'callees' }));
  assert.notEqual(
    graphCacheKey({ view: 'architecture', prefix: 'src' }),
    graphCacheKey({ view: 'architecture', prefix: 'src', recursive: 1 }),
  );
});

test('raw graph entries are defensively copied on write and read', () => {
  const cache = createGraphCache();
  const options = { view: 'filedeps', prefix: 'src' };
  const data = {
    nodes: [{ id: 'a', label: 'A' }],
    edges: [{ source: 'a', target: 'b', kinds: { import: 2 } }],
    mtime: 10,
  };

  cache.setData(options, data);
  data.nodes[0].label = 'mutated source';
  const first = cache.getData(options);
  first.nodes[0].label = 'mutated read';
  first.edges[0].kinds.import = 99;

  const second = cache.getData(options);
  assert.equal(second.nodes[0].label, 'A');
  assert.equal(second.edges[0].kinds.import, 2);
  assert.equal(cache.getData({ view: 'filedeps', prefix: 'test' }), null);
});

test('position snapshots are finite, isolated, and defensively copied', () => {
  const cache = createGraphCache();
  const source = [
    { id: 'a', x: 10, y: 20, vx: 1, vy: -1 },
    { id: 'b', x: Number.NaN, y: 4 },
    { id: 'c', x: 5, y: 6, vx: Number.POSITIVE_INFINITY },
  ];
  const architecture = { view: 'architecture', prefix: 'src' };

  cache.savePositions(architecture, 'territory-map', source);
  const snapshot = cache.getPositions(architecture, 'territory-map');
  assert.deepEqual([...snapshot], [
    ['a', { x: 10, y: 20, vx: 1, vy: -1 }],
    ['c', { x: 5, y: 6, vx: 0, vy: 0 }],
  ]);

  snapshot.get('a').x = 999;
  assert.equal(cache.getPositions(architecture, 'territory-map').get('a').x, 10);
  assert.equal(cache.getPositions(architecture, 'structure-tree'), null);
  assert.equal(cache.getPositions({ view: 'architecture', prefix: 'test' }, 'territory-map'), null);
});

test('version changes invalidate graph data and positions exactly once', () => {
  const cache = createGraphCache();
  const options = { view: 'architecture' };

  assert.equal(cache.setVersion(10), false);
  cache.setData(options, { nodes: [], edges: [], mtime: 10 });
  cache.savePositions(options, 'territory-map', [{ id: 'a', x: 1, y: 2 }]);
  assert.equal(cache.setVersion(10), false);
  assert.ok(cache.getData(options));
  assert.ok(cache.getPositions(options, 'territory-map'));

  assert.equal(cache.setVersion(11), true);
  assert.equal(cache.getData(options), null);
  assert.equal(cache.getPositions(options, 'territory-map'), null);
  assert.equal(cache.setVersion(11), false);
  assert.equal(cache.setVersion(null), false);
});

test('cached positions restore matching model nodes and report reuse', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 3, y: 4 },
  ];
  const snapshot = new Map([
    ['a', { x: 20, y: -10, vx: 2, vy: 1 }],
    ['missing', { x: 1, y: 2, vx: 0, vy: 0 }],
  ]);

  assert.equal(applyCachedPositions(nodes, snapshot), 1);
  assert.deepEqual(nodes[0], { id: 'a', x: 20, y: -10, vx: 2, vy: 1 });
  assert.deepEqual(nodes[1], { id: 'b', x: 3, y: 4 });
  assert.equal(applyCachedPositions(nodes, null), 0);
});

test('graph and position caches evict least-recently-used scopes', () => {
  const cache = createGraphCache({ maxGraphs: 2, maxPositions: 2 });
  const first = { view: 'architecture', prefix: 'first' };
  const second = { view: 'architecture', prefix: 'second' };
  const third = { view: 'architecture', prefix: 'third' };

  cache.setData(first, { id: 'first' });
  cache.setData(second, { id: 'second' });
  assert.deepEqual(cache.getData(first), { id: 'first' });
  cache.setData(third, { id: 'third' });
  assert.equal(cache.getData(second), null);
  assert.deepEqual(cache.getData(first), { id: 'first' });
  assert.deepEqual(cache.getData(third), { id: 'third' });

  cache.savePositions(first, 'nodes', [{ id: 'a', x: 1, y: 1 }]);
  cache.savePositions(second, 'nodes', [{ id: 'b', x: 2, y: 2 }]);
  assert.ok(cache.getPositions(first, 'nodes'));
  cache.savePositions(third, 'nodes', [{ id: 'c', x: 3, y: 3 }]);
  assert.equal(cache.getPositions(second, 'nodes'), null);
  assert.ok(cache.getPositions(first, 'nodes'));
  assert.ok(cache.getPositions(third, 'nodes'));
});
