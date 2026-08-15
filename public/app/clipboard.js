// public/app/clipboard.js — normalized clipboard writes for graph actions.

export async function copyText(value, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    throw new Error('Clipboard is unavailable');
  }
  const text = String(value ?? '');
  await clipboard.writeText(text);
  return text;
}
