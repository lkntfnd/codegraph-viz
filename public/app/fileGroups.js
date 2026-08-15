// public/app/fileGroups.js — derive stable folder groups from file nodes.

export function fileGroupForNode(node) {
  const path = String(node?.path ?? node?.file ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '');
  const segments = path.split('/').filter(Boolean);
  return segments.length > 1 ? segments[0] : '(root)';
}
