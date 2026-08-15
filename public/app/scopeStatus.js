const count = (value) => Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString();

export function truncationMessage(data) {
  if (!data?.truncated) return null;
  const loaded = Number(data.scope?.loaded);
  const total = Number(data.scope?.total);
  if (loaded >= 0 && total > loaded) {
    if (data.view === 'filedeps') {
      return `Loaded ${count(loaded)} of ${count(total)} scoped files · connected externals included`;
    }
    if (data.view === 'callgraph') {
      return `Loaded top ${count(loaded)} of ${count(total)} call-connected symbols`;
    }
  }
  return 'Loaded scope truncated by server limit';
}

export function truncationLabel(data) {
  if (!data?.truncated) return null;
  const loaded = Number(data.scope?.loaded);
  const total = Number(data.scope?.total);
  if (loaded >= 0 && total > loaded) {
    if (data.view === 'filedeps') return `${count(loaded)} / ${count(total)} files`;
    if (data.view === 'callgraph') return `Top ${count(loaded)} / ${count(total)} symbols`;
  }
  return 'Partial server scope';
}
