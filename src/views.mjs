// src/views.mjs — load the graph into memory and derive the three views.

import { normalizeCallDepth, normalizeCallDirection } from '../public/app/graphQuery.js';

const CALL_RE = /call/i;
const DEP_RE = /call|import|reference|extend|implement|type_of|instantiate|override|decorate/i;
const CONTAIN_RE = /contain|defines|child|member/i;
const SEP = String.fromCharCode(1); // map-key separator that can't appear in a path
const CALL_GRAPH_LIMIT = 400;
const FILE_DEPS_LIMIT = 600;

function boundedLimit(value, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return maximum;
  return Math.min(maximum, Math.max(1, Math.trunc(numeric)));
}

const compareIds = (left, right) => String(left).localeCompare(String(right));

function traversalDistances(adjacency, focus, depth) {
  const distances = new Map([[focus, 0]]);
  let frontier = [focus];
  for (let distance = 1; distance <= depth; distance += 1) {
    const next = new Set();
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) || []) {
        if (!distances.has(neighbor)) next.add(neighbor);
      }
    }
    frontier = [...next].sort(compareIds);
    for (const id of frontier) distances.set(id, distance);
  }
  return distances;
}

function focusedCallIds(incoming, outgoing, focus, depth, direction) {
  const callers = direction === 'callees' ? new Map() : traversalDistances(incoming, focus, depth);
  const callees = direction === 'callers' ? new Map() : traversalDistances(outgoing, focus, depth);
  const ordered = [focus];
  const seen = new Set(ordered);

  for (let distance = 1; distance <= depth; distance += 1) {
    const left = [...callers].filter(([, value]) => value === distance).map(([id]) => id);
    const right = [...callees].filter(([, value]) => value === distance).map(([id]) => id);
    const width = Math.max(left.length, right.length);
    for (let index = 0; index < width; index += 1) {
      for (const id of [left[index], right[index]]) {
        if (id === undefined || seen.has(id)) continue;
        seen.add(id);
        ordered.push(id);
      }
    }
  }
  return ordered;
}

/** Load full graph from an open db using a detected schema. Returns normalized structures. */
export function loadGraph(db, S) {
  if (!S.nodesTable || !S.edgesTable) return { error: 'schema-not-detected' };
  const q = (n) => `"${n}"`;

  const fileById = new Map();
  if (S.filesTable && S.filePath) {
    for (const r of db.all(`SELECT * FROM ${q(S.filesTable)}`)) {
      const id = S.fileId ? r[S.fileId] : r.rowid;
      fileById.set(String(id), r[S.filePath]);
    }
  }

  const nodes = new Map();
  const nodeKinds = new Set();
  const selN = S.nodeId
    ? `SELECT *, ${q(S.nodeId)} AS __id FROM ${q(S.nodesTable)}`
    : `SELECT *, rowid AS __id FROM ${q(S.nodesTable)}`;
  for (const r of db.all(selN)) {
    const id = String(r.__id);
    const kind = (S.nodeKind && r[S.nodeKind] != null) ? String(r[S.nodeKind]) : 'unknown';
    let file = null;
    if (S.nodeFile && r[S.nodeFile] != null) {
      const raw = String(r[S.nodeFile]);
      file = fileById.has(raw) ? fileById.get(raw) : raw;
    }
    nodes.set(id, { id, label: S.nodeName ? String(r[S.nodeName] ?? id) : id, kind, file });
    nodeKinds.add(kind);
  }

  const edges = [];
  const edgeKinds = new Set();
  const selE = `SELECT ${q(S.edgeSource)} AS s, ${q(S.edgeTarget)} AS t` +
    (S.edgeKind ? `, ${q(S.edgeKind)} AS k` : '') + ` FROM ${q(S.edgesTable)}`;
  for (const r of db.all(selE)) {
    const k = r.k != null ? String(r.k) : 'edge';
    edges.push({ s: String(r.s), t: String(r.t), k });
    edgeKinds.add(k);
  }

  // node -> file map, with fallback via "contains"-style edges from file/module nodes
  const fileOf = new Map();
  for (const [id, n] of nodes) if (n.file) fileOf.set(id, n.file);
  if (fileOf.size < nodes.size * 0.3) {
    for (const e of edges) {
      if (!CONTAIN_RE.test(e.k)) continue;
      const parent = nodes.get(e.s);
      if (parent && /file|module/i.test(parent.kind) && !fileOf.has(e.t)) fileOf.set(e.t, parent.label);
    }
  }

  return { nodes, edges, fileOf, nodeKinds: [...nodeKinds].sort(), edgeKinds: [...edgeKinds].sort() };
}

const fileOfId = (g, id) => g.fileOf.get(id) || (g.nodes.get(id) && g.nodes.get(id).file) || null;

function fileDepEdges(g) {
  const dependencies = new Map();
  for (const e of g.edges) {
    if (!DEP_RE.test(e.k)) continue;
    const a = fileOfId(g, e.s), b = fileOfId(g, e.t);
    if (!a || !b || a === b) continue;
    const key = a + SEP + b;
    let dependency = dependencies.get(key);
    if (!dependency) {
      dependency = { weight: 0, relations: new Map() };
      dependencies.set(key, dependency);
    }
    dependency.weight += 1;
    dependency.relations.set(e.k, (dependency.relations.get(e.k) || 0) + 1);
  }
  return new Map([...dependencies].map(([key, dependency]) => [key, {
    weight: dependency.weight,
    relations: [...dependency.relations]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, weight]) => ({ kind, weight })),
  }]));
}
function symbolsPerFile(g) {
  const c = new Map();
  for (const [id, n] of g.nodes) {
    const f = fileOfId(g, id);
    if (f) c.set(f, (c.get(f) || 0) + 1);
  }
  return c;
}

// files under a folder prefix (''=everything). Returns a predicate on a path.
function underPrefix(prefix) {
  const base = (prefix || '').split('/').filter(Boolean);
  return (p) => { const parts = String(p).split('/').filter(Boolean); return base.every((b, i) => parts[i] === b); };
}

export function viewCallGraph(g, {
  file = null,
  limit = 400,
  focus = null,
  depth = 2,
  direction = 'both',
  kind = null,
} = {}) {
  limit = boundedLimit(limit, CALL_GRAPH_LIMIT);
  depth = normalizeCallDepth(depth);
  direction = normalizeCallDirection(direction);
  const callEdges = g.edges.filter((e) => CALL_RE.test(e.k));

  // scoped to one file: its functions + their direct callers/callees (external dimmed)
  if (file) {
    const inFile = new Set();
    for (const [id, n] of g.nodes) if (/function|method/i.test(n.kind) && fileOfId(g, id) === file) inFile.add(id);
    const candidates = new Set(inFile);
    const externalWeight = new Map();
    for (const e of callEdges) {
      if (inFile.has(e.s)) {
        candidates.add(e.t);
        if (!inFile.has(e.t)) externalWeight.set(e.t, (externalWeight.get(e.t) || 0) + 1);
      }
      if (inFile.has(e.t)) {
        candidates.add(e.s);
        if (!inFile.has(e.s)) externalWeight.set(e.s, (externalWeight.get(e.s) || 0) + 1);
      }
    }
    const internalIds = [...inFile].sort(compareIds).slice(0, limit);
    const externalIds = [...externalWeight]
      .sort((left, right) => right[1] - left[1] || compareIds(left[0], right[0]))
      .slice(0, Math.max(0, limit - internalIds.length))
      .map(([id]) => id);
    const keep = new Set([...internalIds, ...externalIds]);
    const nodes = [];
    for (const id of keep) {
      const n = g.nodes.get(id);
      if (n) nodes.push({ id, label: n.label, kind: n.kind, file: fileOfId(g, id), focus: inFile.has(id), external: !inFile.has(id) });
    }
    const edges = callEdges
      .filter((e) => (inFile.has(e.s) || inFile.has(e.t)) && keep.has(e.s) && keep.has(e.t))
      .map((e) => ({ source: e.s, target: e.t, kind: e.k }));
    const scope = candidates.size > keep.size
      ? { loaded: keep.size, total: candidates.size, limit }
      : null;
    return { view: 'callgraph', nodes, edges, truncated: scope != null, ...(scope ? { scope } : {}), file };
  }

  let keep;
  let scope = null;
  if (focus && g.nodes.has(focus)) {
    const incoming = new Map();
    const outgoing = new Map();
    const link = (map, a, b) => { (map.get(a) || map.set(a, []).get(a)).push(b); };
    for (const e of callEdges) {
      link(outgoing, e.s, e.t);
      link(incoming, e.t, e.s);
    }
    const ids = focusedCallIds(incoming, outgoing, focus, depth, direction);
    keep = new Set(ids.slice(0, limit));
    if (ids.length > keep.size) scope = { loaded: keep.size, total: ids.length, limit };
  } else {
    const deg = new Map();
    for (const e of callEdges) { deg.set(e.s, (deg.get(e.s) || 0) + 1); deg.set(e.t, (deg.get(e.t) || 0) + 1); }
    let ids = [...deg.entries()];
    if (kind) ids = ids.filter(([id]) => g.nodes.get(id)?.kind === kind);
    ids.sort((a, b) => b[1] - a[1] || compareIds(a[0], b[0]));
    const total = ids.length;
    keep = new Set(ids.slice(0, limit).map(([id]) => id));
    if (total > keep.size) scope = { loaded: keep.size, total, limit };
  }
  const nodes = [];
  for (const id of keep) { const n = g.nodes.get(id); if (n) nodes.push({ id, label: n.label, kind: n.kind, file: n.file, focus: id === focus }); }
  const edges = callEdges.filter((e) => keep.has(e.s) && keep.has(e.t)).map((e) => ({ source: e.s, target: e.t, kind: e.k }));
  return { view: 'callgraph', nodes, edges, truncated: scope != null, ...(scope ? { scope } : {}) };
}

export function viewFileDeps(g, { prefix = '', limit = 600 } = {}) {
  limit = boundedLimit(limit, FILE_DEPS_LIMIT);
  const under = underPrefix(prefix);
  const w = fileDepEdges(g), cnt = symbolsPerFile(g);
  const inFolder = new Set([...cnt.keys()].filter(under));   // every file in the folder, even if isolated
  const ext = new Set();                                     // outside files the folder depends on / is used by
  const edges = [];
  for (const [key, dependency] of w) {
    const [a, b] = key.split(SEP);
    if (!under(a) && !under(b)) continue;                    // edge must touch the folder
    if (!under(a)) ext.add(a);
    if (!under(b)) ext.add(b);
    edges.push({ source: a, target: b, ...dependency });
  }
  const mk = (f, external) => ({ id: f, label: f.split('/').pop(), path: f, size: cnt.get(f) || 1, kind: 'file', external });
  const internalNodes = [...inFolder]
    .map((file) => mk(file, false))
    .sort((left, right) => right.size - left.size || compareIds(left.id, right.id));
  const selectedInternal = internalNodes.slice(0, limit);
  const keep = new Set(selectedInternal.map((node) => node.id));
  const externalWeight = new Map();
  for (const edge of edges) {
    if (keep.has(edge.source) && ext.has(edge.target)) {
      externalWeight.set(edge.target, (externalWeight.get(edge.target) || 0) + edge.weight);
    }
    if (keep.has(edge.target) && ext.has(edge.source)) {
      externalWeight.set(edge.source, (externalWeight.get(edge.source) || 0) + edge.weight);
    }
  }
  const selectedExternal = [...externalWeight]
    .sort((left, right) => right[1] - left[1] || compareIds(left[0], right[0]))
    .slice(0, Math.max(0, limit - selectedInternal.length))
    .map(([file]) => mk(file, true));
  for (const node of selectedExternal) keep.add(node.id);

  const nodes = [...selectedInternal, ...selectedExternal];
  const keptEdges = edges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
  const total = inFolder.size + ext.size;
  const scope = total > nodes.length ? { loaded: nodes.length, total, limit } : null;
  return {
    view: 'filedeps',
    nodes,
    edges: keptEdges,
    truncated: scope != null,
    ...(scope ? { scope } : {}),
    prefix,
  };
}

function viewArchitectureTree(g, prefix) {
  const under = underPrefix(prefix);
  const base = prefix.split('/').filter(Boolean);
  const rootId = prefix || '.';
  const cnt = symbolsPerFile(g);
  const records = new Map([[rootId, {
    id: rootId,
    label: base.at(-1) || 'root',
    path: prefix,
    parent: null,
    size: 0,
    kind: 'folder',
    expandable: true,
  }]]);

  for (const [file, symbolCount] of cnt) {
    if (!under(file)) continue;
    const parts = file.split('/').filter(Boolean);
    records.get(rootId).size += symbolCount;
    for (let depth = base.length + 1; depth <= parts.length; depth += 1) {
      const id = parts.slice(0, depth).join('/');
      const parent = depth === base.length + 1
        ? rootId
        : parts.slice(0, depth - 1).join('/');
      const fileNode = depth === parts.length;
      let record = records.get(id);
      if (!record) {
        record = {
          id,
          label: parts[depth - 1],
          path: id,
          parent,
          size: 0,
          kind: fileNode ? 'file' : 'folder',
          expandable: !fileNode,
        };
        records.set(id, record);
      }
      record.size += symbolCount;
    }
  }

  const descendants = [...records.values()]
    .filter((node) => node.id !== rootId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const nodes = [records.get(rootId), ...descendants];
  const edges = descendants.map((node) => ({
    source: node.parent,
    target: node.id,
    kind: 'contains',
    weight: 1,
  }));
  return {
    view: 'architecture',
    nodes,
    edges,
    truncated: false,
    prefix,
    recursive: true,
    relation: 'containment',
  };
}

// One level of folders/files directly under `prefix` (''=repo root). Single-child
// folder chains are collapsed into one hop (java/com/xm), like an IDE tree.
export function viewArchitecture(g, { prefix = '', recursive = false } = {}) {
  if (recursive) return viewArchitectureTree(g, prefix);
  const under = underPrefix(prefix);
  const base = prefix.split('/').filter(Boolean);
  const cnt = symbolsPerFile(g), w = fileDepEdges(g);
  const files = [...cnt.keys()].filter(under).map((p) => p.split('/').filter(Boolean));

  // map a file's parts -> its collapsed group {name, deeper}, descending through
  // single-child folders until the path branches or hits a file.
  const cache = new Map();
  const groupOf = (p) => {
    if (cache.has(p)) return cache.get(p);
    const parts = p.split('/').filter(Boolean);
    if (!under(p) || parts.length <= base.length) { cache.set(p, null); return null; }
    let d = base.length + 1;
    while (d < parts.length) {
      const pre = parts.slice(0, d).join('/');
      const kids = new Set(); let fileHere = false;
      for (const f of files) {
        if (f.slice(0, d).join('/') !== pre) continue;
        if (f.length === d) fileHere = true; else kids.add(f[d]);
      }
      if (kids.size <= 1 && !fileHere) d++; else break;
    }
    const grp = { name: parts.slice(0, d).join('/'), deeper: parts.length > d };
    cache.set(p, grp);
    return grp;
  };

  const size = new Map(), expandable = new Map();
  for (const [f, c] of cnt) {
    const grp = groupOf(f);
    if (!grp) continue;
    size.set(grp.name, (size.get(grp.name) || 0) + c);
    expandable.set(grp.name, (expandable.get(grp.name) || false) || grp.deeper);
  }
  const fe = new Map();
  for (const [key, dependency] of w) {
    const [a, b] = key.split(SEP);
    const ga = groupOf(a), gb = groupOf(b);
    if (!ga || !gb || ga.name === gb.name) continue;
    const k = ga.name + SEP + gb.name;
    let grouped = fe.get(k);
    if (!grouped) {
      grouped = { weight: 0, relations: new Map() };
      fe.set(k, grouped);
    }
    grouped.weight += dependency.weight;
    for (const relation of dependency.relations) {
      grouped.relations.set(
        relation.kind,
        (grouped.relations.get(relation.kind) || 0) + relation.weight,
      );
    }
  }
  const strip = (id) => (prefix ? id.slice(prefix.length + 1) : id);
  const nodes = [...size.entries()].map(([id, s]) => ({
    id, label: strip(id), path: id, size: s,
    kind: expandable.get(id) ? 'folder' : 'file', expandable: !!expandable.get(id),
  }));
  const edges = [...fe.entries()].map(([k, dependency]) => {
    const [source, target] = k.split(SEP);
    return {
      source,
      target,
      weight: dependency.weight,
      relations: [...dependency.relations]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([kind, weight]) => ({ kind, weight })),
    };
  });
  return { view: 'architecture', nodes, edges, truncated: false, prefix };
}

export function searchNodes(g, term, limit = 60) {
  const q = term.toLowerCase(); const out = [];
  if (!q) return out;
  for (const [, n] of g.nodes) {
    if (n.label.toLowerCase().includes(q)) { out.push({ id: n.id, label: n.label, kind: n.kind, file: n.file }); if (out.length >= limit) break; }
  }
  return out;
}
