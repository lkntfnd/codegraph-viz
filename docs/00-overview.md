# 0 — Overview

## 0.1 What codegraph-viz is today

A zero-dependency Node CLI that opens a project's `.codegraph/codegraph.db`
**read-only** and serves a local single-page web app visualizing the code
knowledge graph in three views:

- **architecture** — one level of folders/files under a prefix (drill in by clicking).
- **file deps** — files in a folder and their import/reference dependencies.
- **call graph** — functions and their callers/callees, scoped to a file.

### Backend (done, do not regress)

| File | Role |
|------|------|
| `bin/cli.mjs` | Entry point; routes subcommands, defaults to `serve`. |
| `src/commands/serve.mjs` | Default command — resolves the db, starts the server, opens a browser. |
| `src/server.mjs` | HTTP server: serves `public/index.html` and the `/api/*` JSON endpoints. |
| `src/views.mjs` | Loads the graph from SQLite and derives the three view aggregations. |
| `src/db.mjs` | SQLite open (read-only) + heuristic schema detection. |
| `src/locate.mjs` | Finds `.codegraph` upward / scans for indexed projects. |
| `src/util.mjs` | Arg parsing, free-port finder, db mtime, formatting. |

### The HTTP API (contract — must not change)

| Route | Returns |
|-------|---------|
| `GET /` , `GET /index.html` | the frontend HTML |
| `GET /api/version` | `{ mtime }` — used for live-refresh polling |
| `GET /api/schema` | `{ detected, dbPath, driver }` |
| `GET /api/meta` | `{ nodeCount, edgeCount, nodeKinds, edgeKinds, … }` |
| `GET /api/search?q=` | `{ results: [{id,label,kind,file}] }` |
| `GET /api/graph?view=&prefix=&file=&focus=&depth=&kind=&limit=` | `{ view, nodes, edges, truncated, mtime, prefix?/file? }` |

Node/edge shapes returned by `/api/graph` (see `src/views.mjs`):

```
node: { id, label, kind, file?, path?, size?, focus?, expandable?, external? }
edge: { source, target, kind? | weight? }
```

### Frontend (this is what we rebuild)

`public/index.html` is a single file that currently mounts **Cytoscape**
(loaded from a unpkg **CDN**) with a **static** `cose` layout
(`animate: false`). It already:

- fetches `/api/meta` and `/api/graph`,
- renders a still graph,
- handles the drill navigation (architecture → folder → file deps → call graph),
- polls `/api/version` every 3s and reloads on change,
- colors nodes by `kind`.

It does **not** have: live physics, per-node gravity, an interactive settings
panel, draggable nodes with a reacting simulation, or theme switching. The CDN
dependency also means it does not work offline.

## 0.2 What we are building

An **Obsidian-graph-view experience** in the browser:

- A **live force simulation** (d3-force) drawn on a **`<canvas>`** for smoothness
  on large graphs.
- **Per-node gravity/mass** derived from the node's degree/size, so hubs sit
  central and heavy while leaves drift to the edge.
- **Styled links** — thin, translucent, weight-scaled, with hover highlighting
  of a node's neighborhood.
- A **full settings panel** (Obsidian-style): sliders for center force, repel
  force, link force, and link distance; display toggles for labels, node size,
  link thickness, and text-fade; filters and color groups.
- A **dark → black** theme toggle (deep charcoal ↔ true OLED black), persisted.
- **Offline-first**: the render library is vendored into `public/vendor/`.

## 0.3 Goals & non-goals

**Goals**
- Feel and interaction parity with Obsidian's graph view, in the browser.
- Preserve every existing behavior (views, drill nav, live refresh, schema errors).
- Stay dependency-free at runtime; keep the npm package self-contained.
- Ship in small, individually verifiable steps.

**Non-goals (out of scope for this plan)**
- A terminal TUI renderer.
- Editing the graph or the database.
- Server-side layout computation (all physics runs in the browser).
- A build step / bundler in the runtime package (vendored files are committed as-is).

## 0.4 Glossary

- **Node / symbol** — a vertex in the graph (folder, file, function, class…).
- **Link / edge** — a relationship (call, import, contains…).
- **Mass / gravity (per node)** — how strongly a node resists motion and pulls on
  the layout; here derived from degree/`size`. See [03-physics-spec.md](03-physics-spec.md).
- **Charge / repulsion** — the many-body force pushing nodes apart.
- **Alpha** — d3-force's simulation "temperature"; decays to 0 as the layout settles.
- **View** — one of `architecture` | `filedeps` | `callgraph`.
- **Drill navigation** — clicking a node to move between views/scopes.
- **Vendoring** — committing a third-party library file into the repo instead of
  fetching it from a CDN at runtime.
