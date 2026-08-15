const REGISTRY = Object.freeze({
  architecture: Object.freeze([
    Object.freeze({ id: 'nodes', label: 'Nodes', description: 'Interactive nodes arranged by gravity and relationship forces.', usesPhysics: true }),
    Object.freeze({ id: 'structure-tree', label: 'Structure tree', description: 'Containment hierarchy for precise codebase navigation.', usesPhysics: false }),
  ]),
  filedeps: Object.freeze([
    Object.freeze({ id: 'hotspot-landscape', label: 'Hotspot landscape', description: 'Coupling-weighted files clustered by folder.', usesPhysics: true }),
    Object.freeze({ id: 'dependency-matrix', label: 'Dependency matrix', description: 'Directed file dependencies expose cycles and dense patterns.', usesPhysics: false }),
  ]),
  callgraph: Object.freeze([
    Object.freeze({ id: 'impact-flow', label: 'Impact flow', description: 'Callers left, callees right, with change paths centered.', usesPhysics: false }),
    Object.freeze({ id: 'radial-reach', label: 'Radial reach', description: 'Hop depth on rings; callers left, callees right.', usesPhysics: false }),
  ]),
});

export function layoutOptions(view) {
  return [...(REGISTRY[view] || REGISTRY.architecture)];
}

export function defaultLayoutId(view) {
  return layoutOptions(view)[0].id;
}

export function normalizeLayoutId(view, value) {
  const id = String(value || '');
  return layoutOptions(view).some((option) => option.id === id) ? id : defaultLayoutId(view);
}

export function hasLayoutChoice(view) {
  return layoutOptions(view).length > 1;
}

export function layoutUsesPhysics(view, value) {
  const id = normalizeLayoutId(view, value);
  return Boolean(layoutOptions(view).find((option) => option.id === id)?.usesPhysics);
}

export function layoutActivityLabel(view, value) {
  const id = normalizeLayoutId(view, value);
  const label = layoutOptions(view).find((option) => option.id === id)?.label || id;
  return `Arranging ${label}`;
}

export function layoutDescription(view, value) {
  const id = normalizeLayoutId(view, value);
  return layoutOptions(view).find((option) => option.id === id)?.description || '';
}
