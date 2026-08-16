import test from 'node:test';
import assert from 'node:assert/strict';

import { tickWithinBudget } from '../public/app/simulationScheduler.js';

test('tickWithinBudget advances a bounded batch and reports remaining work', () => {
  let ticks = 0;
  const times = [0, 1, 2];
  const simulation = { tick: () => { ticks += 1; } };

  const result = tickWithinBudget(simulation, 5, {
    budgetMs: 2,
    now: () => times.shift(),
  });

  assert.deepEqual(result, { completed: 2, remaining: 3 });
  assert.equal(ticks, 2);
});
