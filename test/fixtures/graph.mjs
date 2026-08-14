export const apiData = {
  view: 'filedeps',
  nodes: [
    { id: 'a', label: 'a.js', kind: 'file', size: 10, path: 'src/a.js' },
    { id: 'b', label: 'b.js', kind: 'file', size: 3, path: 'src/b.js' },
    { id: 'c', label: 'c.js', kind: 'file', size: 1, path: 'src/c.js', external: true },
  ],
  edges: [
    { source: 'a', target: 'b', weight: 2 },
    { source: 'a', target: 'c', weight: 1 },
  ],
  truncated: false,
};
