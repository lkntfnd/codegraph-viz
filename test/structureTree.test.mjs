import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStructureCollapseStore,
  defaultStructureCollapseIds,
  projectStructureTreeModel,
  toggleStructureTreeNode,
} from '../public/app/structureTree.js';

test('Structure tree projection removes hidden descendants and their links together', () => {
  const indexes = { nodesById: new Map() };
  const model = {
    nodes: [{ id: '.' }, { id: 'src' }, { id: 'src/app.js' }],
    links: [
      { source: '.', target: 'src' },
      { source: 'src', target: 'src/app.js' },
    ],
    indexes,
  };
  const projected = projectStructureTreeModel(model, new Set(['.', 'src']));
  assert.deepEqual(projected.nodes.map(({ id }) => id), ['.', 'src']);
  assert.deepEqual(projected.links, [{ source: '.', target: 'src' }]);
  assert.equal(projected.indexes, indexes);
});

test('Structure tree collapse state toggles one id without mutating its input', () => {
  const original = new Set(['test']);
  const collapsed = toggleStructureTreeNode(original, 'src');
  const expanded = toggleStructureTreeNode(collapsed, 'test');
  assert.deepEqual([...original], ['test']);
  assert.deepEqual([...collapsed].sort(), ['src', 'test']);
  assert.deepEqual([...expanded], ['src']);
});

test('Structure tree collapse store isolates scopes and returns defensive snapshots', () => {
  const store = createStructureCollapseStore();
  store.save('', new Set(['src']));
  store.save('packages/app', new Set(['packages/app/test']));

  const root = store.get('');
  root.add('mutated-copy');
  assert.deepEqual([...store.get('')], ['src']);
  assert.deepEqual([...store.get('packages/app')], ['packages/app/test']);
  assert.deepEqual([...store.toggle('', 'test')].sort(), ['src', 'test']);
  assert.deepEqual([...store.toggle('', 'src')], ['test']);

  store.save('', new Set());
  assert.equal(store.has(''), true);
  assert.deepEqual([...store.get('')], []);
  assert.deepEqual([...store.get('packages/app')], ['packages/app/test']);
});

test('large Structure trees start with a bounded semantic overview', () => {
  const nodes = [{ id: '.', parent: null }];
  for (let folder = 0; folder < 4; folder += 1) {
    const folderId = `folder-${folder}`;
    nodes.push({ id: folderId, parent: '.' });
    for (let file = 0; file < 30; file += 1) {
      nodes.push({ id: `${folderId}/file-${file}.mjs`, parent: folderId });
    }
  }

  const collapsed = defaultStructureCollapseIds({ nodes }, { limit: 36 });
  const visible = new Set(nodes.map((node) => String(node.id)));
  for (const node of nodes) {
    if (collapsed.has(String(node.parent))) visible.delete(String(node.id));
  }

  assert.ok(collapsed.size > 0);
  assert.ok(visible.size <= 36);
  assert.ok([...collapsed].every((id) => id !== '.'));
});
