import test from 'node:test';
import assert from 'node:assert/strict';

import {
  defaultLayoutId,
  hasLayoutChoice,
  layoutActivityLabel,
  layoutDescription,
  layoutUsesPhysics,
  layoutOptions,
  normalizeLayoutId,
} from '../public/app/layoutRegistry.js';

test('layout registry exposes only implemented choices for each mode', () => {
  assert.deepEqual(layoutOptions('architecture'), [
    { id: 'nodes', label: 'Nodes', description: 'Interactive nodes arranged by gravity and relationship forces.', usesPhysics: true },
    { id: 'structure-tree', label: 'Structure tree', description: 'Containment hierarchy for precise codebase navigation.', usesPhysics: false },
  ]);
  assert.deepEqual(layoutOptions('filedeps'), [
    { id: 'hotspot-landscape', label: 'Hotspot landscape', description: 'Coupling-weighted files clustered by folder.', usesPhysics: true },
    { id: 'dependency-matrix', label: 'Dependency matrix', description: 'Directed file dependencies expose cycles and dense patterns.', usesPhysics: false },
  ]);
  assert.deepEqual(layoutOptions('callgraph').map(({ id }) => id), ['impact-flow', 'radial-reach']);
  assert.equal(hasLayoutChoice('architecture'), true);
  assert.equal(hasLayoutChoice('filedeps'), true);
  assert.equal(hasLayoutChoice('callgraph'), true);
});

test('layout registry exposes physics capability instead of inferring it in controls', () => {
  assert.equal(layoutUsesPhysics('architecture', 'nodes'), true);
  assert.equal(layoutUsesPhysics('architecture', 'structure-tree'), false);
  assert.equal(layoutUsesPhysics('filedeps', 'hotspot-landscape'), true);
  assert.equal(layoutUsesPhysics('filedeps', 'dependency-matrix'), false);
  assert.equal(layoutUsesPhysics('callgraph', 'impact-flow'), false);
  assert.equal(layoutUsesPhysics('callgraph', 'radial-reach'), false);
});

test('layout registry normalizes unknown combinations to the mode default', () => {
  assert.equal(defaultLayoutId('callgraph'), 'impact-flow');
  assert.equal(defaultLayoutId('architecture'), 'nodes');
  assert.equal(normalizeLayoutId('callgraph', 'radial-reach'), 'radial-reach');
  assert.equal(normalizeLayoutId('callgraph', 'territory'), 'impact-flow');
  assert.equal(normalizeLayoutId('architecture', 'territory'), 'nodes');
  assert.equal(normalizeLayoutId('architecture', 'radial-reach'), 'nodes');
});

test('layout activity copy names the normalized mode-specific layout', () => {
  assert.equal(layoutActivityLabel('filedeps', 'dependency-matrix'), 'Arranging Dependency matrix');
  assert.equal(layoutActivityLabel('callgraph', 'unknown'), 'Arranging Impact flow');
});

test('layout descriptions explain the normalized layout purpose', () => {
  assert.equal(layoutDescription('callgraph', 'radial-reach'), 'Hop depth on rings; callers left, callees right.');
  assert.equal(layoutDescription('callgraph', 'unknown'), 'Callers left, callees right, with change paths centered.');
});
