// public/app/landmarks.js — select semantic labels for graph overviews.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function kind(node) {
  return String(node?.kind || '').trim().toLowerCase();
}

function architectureScore(node) {
  const structural = kind(node) === 'folder' ? 1_000_000_000 : 0;
  const expandable = node?.expandable ? 10_000_000 : 0;
  return structural
    + expandable
    + Math.max(0, finite(node?.size)) * 100
    + Math.max(0, finite(node?.degree));
}

function fileDependencyScore(node) {
  return Math.max(0, finite(node?.couplingPercentile)) * 1_000_000
    + Math.max(0, finite(node?.coupling)) * 1_000
    + (node?.inCycle ? 100 : 0)
    + Math.max(0, finite(node?.degree));
}

function callGraphScore(node) {
  if (node?.focus || node?.relationRole === 'focus') return 1_000_000_000_000;
  const depth = Math.max(1, finite(node?.relationDepth, 99));
  const reach = Math.max(0, 100 - depth) * 10_000_000;
  const bidirectional = node?.relationRole === 'bidirectional' ? 100_000 : 0;
  return reach + bidirectional + Math.max(0, finite(node?.degree));
}

function defaultScore(node) {
  return Math.max(0, finite(node?.radius, 3)) * 10
    + Math.log2(1 + Math.max(0, finite(node?.degree)));
}

function score(node, view) {
  if (view === 'architecture') return architectureScore(node);
  if (view === 'filedeps') return fileDependencyScore(node);
  if (view === 'callgraph') return callGraphScore(node);
  return defaultScore(node);
}

export function landmarkBudget(size = {}) {
  const width = Math.max(0, finite(size.width));
  return clamp(Math.floor(width / 120), 8, 16);
}

export function selectLandmarkIds(nodes = [], view = '', limit = 12) {
  const count = clamp(Math.trunc(finite(limit, 12)), 1, 16);
  return nodes
    .filter((node) => node?.id !== undefined && node?.id !== null)
    .map((node) => ({ id: String(node.id), score: score(node, view) }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, count)
    .map(({ id }) => id);
}
