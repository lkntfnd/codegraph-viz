// public/app/perspectives.js — persist portable named graph investigations.

import { clamp } from './settings.js';
import { parseGraphHash, serializeGraphHash } from './urlState.js';

export const PERSPECTIVES_STORAGE_KEY = 'codegraph-viz:perspectives:v1';
const VERSION = 1;
const LIMIT = 20;
const EXPORT_KIND = 'codegraph-viz-perspective';

function clean(value, maximum = 2048) {
  const normalized = String(value ?? '').replaceAll('\0', '').trim().slice(0, maximum);
  return normalized || null;
}

function nameOf(value) {
  const name = clean(value, 80);
  if (!name) throw new TypeError('Perspective name is required');
  return name;
}

function transformOf(transform = {}) {
  const x = Number(transform.x);
  const y = Number(transform.y);
  const k = Number(transform.k);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    k: Number.isFinite(k) && k > 0 ? k : 1,
  };
}

function snapshotOf(snapshot = {}) {
  const semantic = parseGraphHash(serializeGraphHash(snapshot));
  return {
    state: {
      ...semantic,
      selectedId: clean(snapshot.selectedId),
      transform: transformOf(snapshot.transform),
    },
    settings: clamp(snapshot.settings ?? {}),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedItem(value) {
  const id = clean(value?.id, 128);
  const name = clean(value?.name, 80);
  const createdAt = Number(value?.createdAt);
  const updatedAt = Number(value?.updatedAt);
  if (!id || !name || !Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) return null;
  const snapshot = snapshotOf({ ...(value.state ?? {}), settings: value.settings });
  return {
    id,
    name,
    createdAt,
    updatedAt,
    indexMtime: clean(value.indexMtime, 256),
    ...snapshot,
  };
}

function ordered(items) {
  return [...items]
    .sort((left, right) => right.updatedAt - left.updatedAt
      || right.createdAt - left.createdAt
      || left.id.localeCompare(right.id))
    .slice(0, LIMIT);
}

function withStale(item, currentMtime) {
  const current = clean(currentMtime, 256);
  return {
    ...clone(item),
    stale: Boolean(current && item.indexMtime && current !== item.indexMtime),
  };
}

export function parsePerspectiveExport(text) {
  let payload;
  try {
    payload = JSON.parse(String(text));
  } catch {
    throw new TypeError('Invalid perspective JSON');
  }
  if (payload?.kind !== EXPORT_KIND) throw new TypeError('Unsupported perspective format');
  if (payload.version !== VERSION) throw new TypeError('Unsupported perspective version');
  const perspective = payload.perspective;
  const name = nameOf(perspective?.name);
  return {
    name,
    indexMtime: clean(perspective.indexMtime, 256),
    ...snapshotOf({ ...(perspective.state ?? {}), settings: perspective.settings }),
  };
}

export function createPerspectiveStore(storage, {
  now = () => Date.now(),
  createId = () => `perspective-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
} = {}) {
  if (!storage?.getItem || !storage?.setItem) throw new TypeError('Perspective storage is required');

  function read() {
    try {
      const parsed = JSON.parse(storage.getItem(PERSPECTIVES_STORAGE_KEY) || 'null');
      if (parsed?.version !== VERSION || !Array.isArray(parsed.items)) return [];
      return ordered(parsed.items.map(normalizedItem).filter(Boolean));
    } catch {
      return [];
    }
  }

  function write(items) {
    const next = ordered(items);
    storage.setItem(PERSPECTIVES_STORAGE_KEY, JSON.stringify({ version: VERSION, items: next }));
    return next;
  }

  return {
    list(currentMtime = null) {
      return read().map((item) => withStale(item, currentMtime));
    },
    get(id, currentMtime = null) {
      const target = clean(id, 128);
      const item = read().find((candidate) => candidate.id === target);
      return item ? withStale(item, currentMtime) : null;
    },
    export(id) {
      const target = clean(id, 128);
      const item = read().find((candidate) => candidate.id === target);
      if (!item) throw new TypeError('Perspective was not found');
      return JSON.stringify({
        kind: EXPORT_KIND,
        version: VERSION,
        perspective: {
          name: item.name,
          indexMtime: item.indexMtime,
          state: item.state,
          settings: item.settings,
        },
      }, null, 2);
    },
    import(text, currentMtime = null) {
      const parsed = parsePerspectiveExport(text);
      const items = read();
      const names = new Set(items.map((item) => item.name.toLowerCase()));
      let name = parsed.name;
      for (let index = 1; names.has(name.toLowerCase()); index += 1) {
        const suffix = index === 1 ? ' (imported)' : ` (imported ${index})`;
        name = `${parsed.name.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
      }
      const timestamp = Number(now());
      const safeTime = Number.isFinite(timestamp) ? timestamp : Date.now();
      let id = clean(createId(), 128) ?? `perspective-${safeTime}`;
      if (items.some((item) => item.id === id)) id = `${id}-${safeTime}`.slice(0, 128);
      const item = {
        id,
        name,
        createdAt: safeTime,
        updatedAt: safeTime,
        indexMtime: parsed.indexMtime,
        ...snapshotOf({ ...parsed.state, settings: parsed.settings }),
      };
      write([...items, item]);
      return withStale(item, currentMtime);
    },
    save(name, snapshot, indexMtime = null) {
      const normalizedName = nameOf(name);
      const items = read();
      const existing = items.find((item) => item.name.toLowerCase() === normalizedName.toLowerCase());
      const timestamp = Number(now());
      const safeTime = Number.isFinite(timestamp) ? timestamp : Date.now();
      const item = {
        id: existing?.id ?? clean(createId(), 128) ?? `perspective-${safeTime}`,
        name: normalizedName,
        createdAt: existing?.createdAt ?? safeTime,
        updatedAt: safeTime,
        indexMtime: clean(indexMtime, 256),
        ...snapshotOf(snapshot),
      };
      write([...items.filter((candidate) => candidate.id !== item.id), item]);
      return withStale(item, indexMtime);
    },
    rename(id, name) {
      const target = clean(id, 128);
      const normalizedName = nameOf(name);
      const items = read();
      const item = items.find((candidate) => candidate.id === target);
      if (!item) return null;
      const collision = items.find((candidate) => (
        candidate.id !== target && candidate.name.toLowerCase() === normalizedName.toLowerCase()
      ));
      if (collision) throw new TypeError('Perspective name already exists');
      item.name = normalizedName;
      const timestamp = Number(now());
      item.updatedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
      write(items);
      return withStale(item, null);
    },
    delete(id) {
      const target = clean(id, 128);
      const items = read();
      const next = items.filter((item) => item.id !== target);
      if (next.length === items.length) return false;
      write(next);
      return true;
    },
  };
}
