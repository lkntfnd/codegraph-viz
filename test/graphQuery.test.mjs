import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CALL_DEPTH,
  DEFAULT_CALL_DIRECTION,
  buildGraphOptions,
  normalizeCallDepth,
  normalizeCallDirection,
} from '../public/app/graphQuery.js';

test('call depth defaults to 2 and is clamped to the supported 1-5 range', () => {
  assert.equal(DEFAULT_CALL_DEPTH, 2);
  assert.equal(normalizeCallDepth(undefined), 2);
  assert.equal(normalizeCallDepth('invalid'), 2);
  assert.equal(normalizeCallDepth(0), 1);
  assert.equal(normalizeCallDepth(3.8), 3);
  assert.equal(normalizeCallDepth(99), 5);
});

test('call direction accepts callers, both, or callees and defaults to both', () => {
  assert.equal(DEFAULT_CALL_DIRECTION, 'both');
  assert.equal(normalizeCallDirection('callers'), 'callers');
  assert.equal(normalizeCallDirection('callees'), 'callees');
  assert.equal(normalizeCallDirection('BOTH'), 'both');
  assert.equal(normalizeCallDirection('sideways'), 'both');
});

test('focused Call graph options include normalized depth', () => {
  assert.deepEqual(buildGraphOptions({
    view: 'callgraph',
    prefix: '',
    file: null,
    focus: 'symbol:42',
    callDepth: 4,
    callDirection: 'callers',
  }), {
    view: 'callgraph',
    focus: 'symbol:42',
    depth: 4,
    direction: 'callers',
  });
});

test('non-Call graph options do not leak Call graph depth', () => {
  assert.deepEqual(buildGraphOptions({
    view: 'filedeps',
    prefix: 'src/app',
    file: null,
    focus: null,
    callDepth: 5,
    callDirection: 'callees',
  }), {
    view: 'filedeps',
    prefix: 'src/app',
  });
});

test('Structure tree requests recursive Architecture containment without leaking it elsewhere', () => {
  assert.deepEqual(buildGraphOptions({
    view: 'architecture',
    prefix: 'src/app',
    layoutId: 'structure-tree',
  }), {
    view: 'architecture',
    prefix: 'src/app',
    recursive: 1,
  });

  assert.deepEqual(buildGraphOptions({
    view: 'architecture',
    prefix: 'src/app',
    layoutId: 'territory',
  }), {
    view: 'architecture',
    prefix: 'src/app',
  });
});
