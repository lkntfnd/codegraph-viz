import { GRAPH_CONSTANTS } from './settings.js';

export const KIND_COLORS = Object.freeze({
  folder: '#c98cff',
  module: '#c98cff',
  file: '#f5b14c',
  function: '#38e1c6',
  method: '#38e1c6',
  class: '#6aa6ff',
  interface: '#6aa6ff',
  external: '#4a5560',
  unknown: '#6b7682',
});

function colorFor(node) {
  if (node.external) return KIND_COLORS.external;

  const normalizedKind = typeof node.kind === 'string'
    ? node.kind.trim().toLowerCase()
    : '';

  return KIND_COLORS[normalizedKind] ?? KIND_COLORS.unknown;
}

export function build(apiData, settings = {}) {
  const modelSettings = { ...GRAPH_CONSTANTS, ...settings };
  const inputNodes = apiData.nodes ?? [];
  const nodeIds = new Set(inputNodes.map((node) => String(node.id)));
  const links = (apiData.edges ?? [])
    .map((edge) => ({
      source: String(edge.source),
      target: String(edge.target),
      weight: edge.weight ?? 1,
    }))
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const degrees = new Map([...nodeIds].map((id) => [id, 0]));

  for (const link of links) {
    degrees.set(link.source, degrees.get(link.source) + 1);
    degrees.set(link.target, degrees.get(link.target) + 1);
  }

  const nodes = inputNodes.map((node) => {
    const id = String(node.id);
    const degree = degrees.get(id);
    const importance = node.size ?? degree ?? 1;
    const radius = Math.min(
      modelSettings.R_MAX,
      Math.max(
        modelSettings.R_MIN,
        modelSettings.BASE_R + modelSettings.R_SCALE * Math.sqrt(importance),
      ),
    );
    const mass = 1 + modelSettings.MASS_SCALE * Math.sqrt(importance);

    return { ...node, id, degree, mass, radius, color: colorFor(node) };
  });

  return { nodes, links };
}
