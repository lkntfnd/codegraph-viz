function safeCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function counted(value, singular, plural = `${singular}s`) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

export function formatGraphCount({ visibleNodes, totalNodes, visibleLinks, collapsed } = {}) {
  const visible = safeCount(visibleNodes);
  const total = safeCount(totalNodes);
  const links = safeCount(visibleLinks);
  const isCollapsed = collapsed === true || (collapsed !== false && visible !== total);
  if (isCollapsed) {
    return `${visible.toLocaleString()} of ${counted(total, 'node')} · ${counted(links, 'visible link')}`;
  }
  return `${counted(total, 'node')} · ${counted(links, 'link')}`;
}
