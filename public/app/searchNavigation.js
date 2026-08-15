// public/app/searchNavigation.js — move a listbox cursor from keyboard input.

export function searchIndexAfterKey(currentIndex, itemCount, key) {
  const count = Math.max(0, Math.trunc(Number(itemCount) || 0));
  if (!count) return -1;
  const numeric = Number(currentIndex);
  const current = Number.isFinite(numeric)
    ? Math.min(count - 1, Math.max(-1, Math.trunc(numeric)))
    : -1;
  if (key === 'ArrowDown') return current < 0 ? 0 : Math.min(count - 1, current + 1);
  if (key === 'ArrowUp') return current < 0 ? count - 1 : Math.max(0, current - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return current;
}
