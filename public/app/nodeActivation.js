export function activationFor(event, hasNode) {
  if (event?.type === 'dblclick') return hasNode ? 'drill' : 'ignore';
  if (event?.type !== 'click') return 'ignore';
  if (Number(event.detail) > 1) return 'ignore';
  return hasNode ? 'select' : 'background';
}

export function pendingSelectionCameraAction(view, selectedId, focusId) {
  const selected = String(selectedId || '');
  const focus = String(focusId || '');
  return view === 'callgraph' && selected && selected === focus
    ? 'preserve-fit'
    : 'center';
}
