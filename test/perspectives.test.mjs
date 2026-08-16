import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PERSPECTIVES_STORAGE_KEY,
  createPerspectiveStore,
  parsePerspectiveExport,
} from '../public/app/perspectives.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const snapshot = {
  view: 'filedeps',
  layoutId: 'dependency-matrix',
  prefix: 'src',
  hiddenRelationKinds: [' Imports ', 'calls'],
  minRelationWeight: 4,
  fileEvidence: 'all',
  minCouplingPercentile: 90,
  selectedId: 'src/app.mjs',
  transform: { x: 12, y: -4, k: 1.8 },
  settings: { theme: 'black', labelSize: 17, labelDensity: 'dense' },
};

test('perspective storage canonicalizes and defensively restores an investigation', () => {
  const storage = memoryStorage();
  const store = createPerspectiveStore(storage, {
    now: () => 100,
    createId: () => 'perspective-1',
  });
  const saved = store.save('  Coupling review  ', snapshot, 'mtime-1');
  assert.equal(saved.name, 'Coupling review');
  assert.equal(saved.state.minCouplingPercentile, 90);
  assert.deepEqual(saved.state.hiddenRelationKinds, ['calls', 'imports']);
  assert.equal(saved.settings.theme, 'black');
  assert.equal(saved.stale, false);

  saved.state.transform.k = 99;
  const restored = store.get('perspective-1', 'mtime-2');
  assert.equal(restored.state.transform.k, 1.8);
  assert.equal(restored.stale, true);
});

test('perspective export is versioned, portable, and excludes local/raw state', () => {
  const store = createPerspectiveStore(memoryStorage(), { now: () => 1, createId: () => 'local-id' });
  store.save('Portable review', { ...snapshot, model: { secret: 'raw graph' } }, 'mtime-1');
  const text = store.export('local-id');
  const payload = JSON.parse(text);
  assert.deepEqual(Object.keys(payload), ['kind', 'version', 'perspective']);
  assert.equal(payload.kind, 'codegraph-viz-perspective');
  assert.equal(payload.version, 1);
  assert.equal(payload.perspective.name, 'Portable review');
  assert.equal('id' in payload.perspective, false);
  assert.equal(text.includes('raw graph'), false);
  const parsed = parsePerspectiveExport(text);
  assert.equal(parsed.state.layoutId, 'dependency-matrix');
  assert.equal(parsed.settings.labelSize, 17);
});

test('perspective export parser rejects corrupt and incompatible payloads', () => {
  assert.throws(() => parsePerspectiveExport('{bad'), /invalid/i);
  assert.throws(() => parsePerspectiveExport(JSON.stringify({
    kind: 'codegraph-viz-perspective', version: 99, perspective: {},
  })), /version/i);
  assert.throws(() => parsePerspectiveExport(JSON.stringify({
    kind: 'other', version: 1, perspective: {},
  })), /format/i);
});

test('perspective import preserves mtime and avoids same-name overwrite', () => {
  const source = createPerspectiveStore(memoryStorage(), { now: () => 1, createId: () => 'source-id' });
  source.save('Shared review', snapshot, 'old-mtime');
  const exported = source.export('source-id');

  let ids = 0;
  const target = createPerspectiveStore(memoryStorage(), {
    now: () => 2 + ids,
    createId: () => `target-${++ids}`,
  });
  target.save('Shared review', { ...snapshot, minRelationWeight: 8 }, 'current-mtime');
  const first = target.import(exported, 'current-mtime');
  const second = target.import(exported, 'current-mtime');
  assert.equal(first.name, 'Shared review (imported)');
  assert.equal(first.stale, true);
  assert.equal(first.indexMtime, 'old-mtime');
  assert.equal(second.name, 'Shared review (imported 2)');
  assert.equal(target.get('target-1').state.minRelationWeight, 8);
  assert.equal(target.list().length, 3);
});

test('saving the same case-insensitive name updates instead of duplicating', () => {
  let time = 1;
  let ids = 0;
  const store = createPerspectiveStore(memoryStorage(), {
    now: () => time,
    createId: () => `id-${++ids}`,
  });
  const first = store.save('Review', snapshot, 'a');
  time = 2;
  const updated = store.save(' review ', { ...snapshot, minRelationWeight: 8 }, 'b');
  assert.equal(updated.id, first.id);
  assert.equal(updated.createdAt, 1);
  assert.equal(updated.updatedAt, 2);
  assert.equal(updated.state.minRelationWeight, 8);
  assert.equal(store.list().length, 1);
});

test('rename and delete are bounded, case-insensitive, and persistent', () => {
  const storage = memoryStorage();
  const store = createPerspectiveStore(storage, { now: () => 1, createId: () => 'id-1' });
  store.save('First', snapshot, 'a');
  assert.equal(store.rename('id-1', '  Final  ').name, 'Final');
  assert.throws(() => store.rename('id-1', '   '), /name/i);
  assert.equal(store.delete('missing'), false);
  assert.equal(store.delete('id-1'), true);
  assert.deepEqual(createPerspectiveStore(storage).list(), []);
});

test('corrupt and incompatible storage reads as empty without mutating storage', () => {
  const corrupt = memoryStorage({ [PERSPECTIVES_STORAGE_KEY]: '{bad' });
  assert.deepEqual(createPerspectiveStore(corrupt).list(), []);
  const future = memoryStorage({
    [PERSPECTIVES_STORAGE_KEY]: JSON.stringify({ version: 99, items: [{ id: 'unsafe' }] }),
  });
  assert.deepEqual(createPerspectiveStore(future).list(), []);
});

test('perspective storage keeps the twenty most recently updated entries', () => {
  let time = 0;
  let ids = 0;
  const store = createPerspectiveStore(memoryStorage(), {
    now: () => ++time,
    createId: () => `id-${++ids}`,
  });
  for (let index = 0; index < 22; index += 1) store.save(`View ${index}`, snapshot, 'mtime');
  const items = store.list('mtime');
  assert.equal(items.length, 20);
  assert.equal(items[0].name, 'View 21');
  assert.equal(items.at(-1).name, 'View 2');
  assert.equal(items.some((item) => item.stale), false);
});
