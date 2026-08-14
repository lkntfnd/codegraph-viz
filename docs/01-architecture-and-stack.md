# 1 — Architecture & Stack

## 1.1 The stack (locked)

| Concern | Choice | Why |
|--------|--------|-----|
| Physics | **d3-force** | Battle-tested force simulation; runs headless in Node (so the sim is unit-testable) and in the browser; this is the same family of forces Obsidian's graph uses. |
| Rendering | **HTML5 `<canvas>` 2D** | Draws thousands of nodes/links per frame far more cheaply than SVG/DOM. Obsidian's smoothness comes from immediate-mode canvas drawing. |
| Interaction | **d3-zoom + d3-drag** | Pan/zoom and node dragging, integrated with the canvas transform. Bundled in the vendored d3. |
| Delivery | **Vendored `public/vendor/d3.v7.min.js`**, served locally | Zero runtime npm deps; works offline; package stays self-contained. |
| Frontend code | **Native ES modules** under `public/app/`, served as static files | Splits testable logic (pure JS) from render/DOM glue; no bundler needed — the browser loads modules directly. |
| Tests | **`node --test`** (built-in, Node ≥22.5) | No new dependency; matches the project's zero-dep ethos. See doc 5. |

### Why d3-force + canvas over keeping Cytoscape

- Cytoscape couples layout to its own DOM/SVG renderer; a truly Obsidian-like,
  continuously-simulating, drag-reactive canvas is fighting the grain.
- d3-force exposes each force independently (`forceManyBody`, `forceLink`,
  `forceCenter`, `forceX/Y`, `forceCollide`), which maps **directly** onto the
  Obsidian settings-panel sliders (repel, link force, link distance, center).
- The simulation object has **no DOM dependency**, so Phase 2/3 can unit-test
  mass computation and convergence in Node.

### Why vendor a single `d3.v7.min.js` (not per-module d3-force)

`d3-force` alone pulls transitive micro-libs (`d3-quadtree`, `d3-dispatch`,
`d3-timer`, `d3-binarytree`) and we also want `d3-zoom`/`d3-drag`/`d3-selection`.
The one-file UMD bundle `d3.v7.min.js` contains all of them, loads as a single
`<script>` exposing the global `d3`, and is the simplest thing to commit and
serve. One file, one version, offline. (Exact fetch instructions are in the
roadmap, Phase 1.)

> Trade-off accepted: the full d3 bundle (~280 KB minified) is larger than a
> hand-rolled force-only bundle. For a local dev tool served over localhost this
> is irrelevant, and it removes all bundling complexity for the implementing
> agent.

## 1.2 Target file layout

```
public/
  index.html            shell: header, tabs, crumbs, <canvas id="graph">, settings panel markup
  styles.css            all CSS, with theme tokens as CSS custom properties
  vendor/
    d3.v7.min.js        vendored, committed (offline)
  app/
    main.js             entry module: wiring, state, API calls, live-refresh poll
    api.js              thin fetch helpers around /api/*
    graphModel.js       PURE: API {nodes,edges} -> sim nodes/links + mass/radius   (unit-tested)
    forces.js           PURE: settings -> d3-force config (strengths/distances)     (unit-tested)
    settings.js         PURE: schema, defaults, clamp, (de)serialize to localStorage (unit-tested)
    theme.js            PURE-ish: theme token tables + apply(theme) to :root         (token tables unit-tested)
    render.js           canvas draw loop (nodes, links, labels). Manual verification.
    interactions.js     drag, zoom/pan, hover neighborhood, click-to-drill.          Manual verification.
    panel.js            settings-panel DOM: build controls, bind to settings + sim.  Manual verification.
test/
  server.test.mjs       backend: static serving, API shape (characterization)
  graphModel.test.mjs   pure logic
  forces.test.mjs       pure logic
  settings.test.mjs     pure logic
  theme.test.mjs        token tables
  simulation.test.mjs   d3-force converges to finite positions (headless)
```

> `panel.js`, `render.js`, `interactions.js` touch the DOM/canvas and are verified
> manually via the checklists in doc 5 — do not try to unit-test canvas pixels.

## 1.3 Data flow

```
codegraph.db ──(read-only)──> src/db + src/views ──JSON──> /api/graph
                                                              │
                                        api.js fetch ─────────┘
                                                              │
                                    graphModel.js (pure): add mass, radius, color
                                                              │
                          ┌───────────────────────────────────┤
                          ▼                                    ▼
                    forces.js (settings→forces)          render.js (canvas)
                          │                                    ▲
                          ▼                                    │
                 d3.forceSimulation ──on 'tick'──> positions ─┘
                          ▲
                          │ live updates
                    panel.js sliders ──> settings.js ──> forces.js.apply(sim)
```

- The **backend is unchanged** except for one addition: serving static files
  under `public/` (needed so `vendor/` and `app/` load). See roadmap Phase 1.
- All physics and rendering happen client-side.
- **Live refresh stays**: `main.js` keeps polling `/api/version`; on change it
  refetches the current view and feeds new data into the existing simulation
  (reusing node positions where ids match, so the graph doesn't "explode").

## 1.4 Server static-file serving (the one backend change)

Today `src/server.mjs` only answers `/`, `/index.html`, and `/api/*`. To serve
`public/styles.css`, `public/vendor/*.js`, and `public/app/*.js`, add a static
handler that:

- maps the URL path to a file **inside `PUBLIC`** only,
- **rejects path traversal** (resolve the path and confirm it still starts with
  `PUBLIC`; reject `..`, absolute paths, null bytes),
- sets a correct `Content-Type` by extension (`.js`→`text/javascript`,
  `.css`→`text/css`, `.html`→`text/html`, fallback `application/octet-stream`),
- returns 404 for anything missing, and never serves outside `PUBLIC`.

This is the first real TDD target (Phase 1): the traversal rejection and the
content types are all assertable with `node:test`.

## 1.5 Constraints that shape every decision

- **Read-only DB** — no schema, no writes, ever.
- **Zero runtime deps** — vendored assets only; no `npm install` for users.
- **Node ≥ 22.5** with `node:sqlite` (or `better-sqlite3` fallback) — don't use
  APIs newer than that baseline.
- **Cross-platform paths** — always build paths with `node:path`
  (`join`/`resolve`); never hand-concatenate with `/`. (The repo is developed on
  Windows *and* documented as macOS-focused — see the browser-open note in doc 6.)
- **No API/contract changes** — the frontend rewrite consumes the *existing*
  JSON; if you find yourself wanting to change `/api/graph`'s shape, stop and
  reconsider (doc 6).
