import test from 'node:test';
import assert from 'node:assert/strict';

import { createCanvasTransition } from '../public/app/canvasTransition.js';

function fixture(reduced = false) {
  const classes = new Set();
  const draws = [];
  const listeners = new Map();
  const frames = new Map();
  const timers = new Map();
  let nextId = 0;
  const source = { width: 600, height: 400 };
  const overlay = {
    width: 0,
    height: 0,
    hidden: true,
    offsetWidth: 600,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    getContext: () => ({
      clearRect: (...args) => draws.push(['clear', ...args]),
      drawImage: (...args) => draws.push(['draw', ...args]),
    }),
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  const transition = createCanvasTransition({
    source,
    overlay,
    reducedMotion: () => reduced,
    scheduleFrame: (callback) => { const id = ++nextId; frames.set(id, callback); return id; },
    cancelFrame: (id) => frames.delete(id),
    scheduleFallback: (callback) => { const id = ++nextId; timers.set(id, callback); return id; },
    cancelFallback: (id) => timers.delete(id),
  });
  return { transition, source, overlay, classes, draws, listeners, frames, timers };
}

test('Canvas transition snapshots one owned frame and clears after opacity transition', () => {
  const state = fixture();
  const ticket = state.transition.capture();
  assert.equal(state.overlay.hidden, false);
  assert.equal(state.overlay.width, 600);
  assert.equal(state.overlay.height, 400);
  assert.deepEqual(state.draws.at(-1), ['draw', state.source, 0, 0]);

  assert.equal(state.transition.reveal(ticket), true);
  state.frames.values().next().value();
  assert.equal(state.classes.has('is-revealing'), true);
  state.listeners.get('transitionend')({ propertyName: 'opacity' });
  assert.equal(state.overlay.hidden, true);
  assert.equal(state.classes.has('is-revealing'), false);
});

test('Canvas transition ignores stale tickets and skips animation for reduced motion', () => {
  const state = fixture(true);
  const stale = state.transition.capture();
  const current = state.transition.capture();
  assert.equal(state.transition.reveal(stale), false);
  assert.equal(state.transition.reveal(current), true);
  assert.equal(state.overlay.hidden, true);
  assert.equal(state.frames.size, 0);
});
