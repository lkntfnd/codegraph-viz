export function tickWithinBudget(simulation, remainingTicks, options = {}) {
  if (typeof simulation?.tick !== 'function') {
    throw new TypeError('tickWithinBudget requires a simulation with tick()');
  }

  const remaining = Math.max(0, Math.floor(Number(remainingTicks) || 0));
  if (!remaining) return { completed: 0, remaining: 0 };

  const budgetMs = Math.max(0, Number(options.budgetMs) || 0);
  const now = options.now || (() => performance.now());
  const startedAt = now();
  let completed = 0;

  while (completed < remaining) {
    simulation.tick();
    completed += 1;
    if (completed < remaining && now() - startedAt >= budgetMs) break;
  }

  return { completed, remaining: remaining - completed };
}
