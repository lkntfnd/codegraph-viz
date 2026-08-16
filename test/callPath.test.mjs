import assert from 'node:assert/strict';
import test from 'node:test';

import { callLinkKey, findLoadedCallPath } from '../public/app/callPath.js';

function model(nodes, links) {
  return {
    nodes: nodes.map(([id, relationRole]) => ({
      id,
      relationRole,
      focus: relationRole === 'focus',
    })),
    links: links.map(([source, target]) => ({ source, target })),
  };
}

test('loaded call path follows a caller toward focus', () => {
  const graph = model(
    [['focus', 'focus'], ['caller', 'inbound'], ['outer', 'inbound'], ['noise', 'context']],
    [['outer', 'caller'], ['caller', 'focus'], ['outer', 'noise'], ['noise', 'focus']],
  );

  assert.deepEqual(findLoadedCallPath(graph, 'outer'), {
    direction: 'inbound',
    nodeIds: ['outer', 'caller', 'focus'],
    linkKeys: [callLinkKey('outer', 'caller'), callLinkKey('caller', 'focus')],
  });
});

test('loaded call path follows focus toward a callee', () => {
  const graph = model(
    [['focus', 'focus'], ['callee', 'outbound'], ['leaf', 'outbound']],
    [['focus', 'callee'], ['callee', 'leaf']],
  );

  assert.deepEqual(findLoadedCallPath(graph, 'leaf'), {
    direction: 'outbound',
    nodeIds: ['focus', 'callee', 'leaf'],
    linkKeys: [callLinkKey('focus', 'callee'), callLinkKey('callee', 'leaf')],
  });
});

test('loaded call path is deterministic across cycles and absent selections', () => {
  const graph = model(
    [['focus', 'focus'], ['cycle', 'both'], ['other', 'both']],
    [['focus', 'cycle'], ['cycle', 'focus'], ['focus', 'other'], ['other', 'cycle']],
  );

  assert.deepEqual(findLoadedCallPath(graph, 'cycle'), {
    direction: 'outbound',
    nodeIds: ['focus', 'cycle'],
    linkKeys: [callLinkKey('focus', 'cycle')],
  });
  assert.equal(findLoadedCallPath(graph, 'missing'), null);
  assert.equal(findLoadedCallPath({ nodes: [], links: [] }, 'cycle'), null);
});
