export const RECENT_SYMBOLS_STORAGE_KEY = 'codegraph-viz:recent-symbols:v1';
const DEFAULT_LIMIT = 5;

function normalizeSymbol(symbol) {
  if (symbol?.id === undefined || symbol?.id === null) return null;
  const id = String(symbol.id);
  if (!id) return null;
  return {
    id,
    label: String(symbol.label ?? id),
    kind: String(symbol.kind ?? 'unknown'),
    file: symbol.file == null ? null : String(symbol.file),
  };
}

export function rememberRecentSymbol(items = [], symbol, limit = DEFAULT_LIMIT) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return items;
  const maximum = Math.max(1, Math.trunc(Number(limit) || DEFAULT_LIMIT));
  return [normalized, ...items
    .map(normalizeSymbol)
    .filter((item) => item && item.id !== normalized.id)]
    .slice(0, maximum);
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice()
    .reverse()
    .reduce((result, item) => rememberRecentSymbol(result, item), []);
}

export function createRecentSymbolStore(storage, key = RECENT_SYMBOLS_STORAGE_KEY) {
  return {
    load(mtime) {
      try {
        const parsed = JSON.parse(storage?.getItem(key) || 'null');
        if (!parsed || String(parsed.mtime) !== String(mtime)) return [];
        return normalizeItems(parsed.items);
      } catch {
        return [];
      }
    },
    save(mtime, items) {
      try {
        storage?.setItem(key, JSON.stringify({ mtime, items: normalizeItems(items) }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
