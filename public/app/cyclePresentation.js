const DEFAULT_MEMBER_LIMIT = 20;

export function cycleMemberWindow(members, selectedId, options = {}) {
  const normalized = Array.isArray(members)
    ? members.map((member) => ({
      nodeId: String(member?.nodeId ?? ''),
      label: String(member?.label ?? member?.nodeId ?? ''),
    }))
    : [];
  const selected = selectedId == null ? null : String(selectedId);
  const selectedIndex = selected == null
    ? -1
    : normalized.findIndex((member) => member.nodeId === selected);
  const ordered = selectedIndex < 0
    ? normalized
    : [normalized[selectedIndex], ...normalized.filter((_, index) => index !== selectedIndex)];
  const limit = Math.max(1, Math.floor(Number(options.limit) || DEFAULT_MEMBER_LIMIT));
  const expanded = Boolean(options.expanded);
  return {
    members: (expanded ? ordered : ordered.slice(0, limit)).map((member) => ({ ...member })),
    hiddenCount: expanded ? 0 : Math.max(0, ordered.length - limit),
    expanded,
    canToggle: ordered.length > limit,
  };
}
