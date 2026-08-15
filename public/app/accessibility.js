function sentence(value) {
  return String(value || '').trim().replace(/[.\s]+$/, '');
}

export function graphReadyAnnouncement(label, graphCount) {
  const readyLabel = sentence(label);
  const count = sentence(graphCount);
  return `${readyLabel} ready.${count ? ` ${count}.` : ''}`;
}

export function selectionClearedAnnouncement() {
  return 'Selection cleared. Focus returned to graph.';
}
