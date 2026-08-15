// public/app/tabNavigation.js — normalize arrow-key movement across view tabs.

export function tabIndexAfterKey(currentIndex, count, key) {
  if (!Number.isInteger(count) || count <= 0) return null;
  const current = Number.isInteger(currentIndex) && currentIndex >= 0 ? currentIndex : 0;
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
