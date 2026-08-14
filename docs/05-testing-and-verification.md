# 5 — Testing & Verification

## 5.1 Philosophy

There are **no tests in the repo today**, and much of this feature is canvas/DOM
rendering that cannot be meaningfully pixel-unit-tested. So verification is split:

- **Unit tests (`node --test`)** cover everything *pure and logical*: the server's
  static-serving/traversal guard and API shape, the graph model, the force
  configuration, settings clamp/serialize, theme token tables, and — importantly
  — that the **d3-force simulation converges to finite positions** headlessly.
- **Manual browser checklists** (below) are the gate for the visual/interactive
  phases. They are explicit, ordered, and pass/fail — not vibes.

An agent must run **both** the relevant unit tests and the relevant checklist to
close a phase.

## 5.2 Running tests

```bash
node --test
```

(Also wired as `npm test` in Phase 0.) Node ≥ 22.5 is required (already the
project baseline). Tests live in `test/*.test.mjs` and use only built-ins:
`node:test`, `node:assert/strict`, `node:http`.

## 5.3 Testing d3-force in Node

The vendored bundle is a **UMD/global** build meant for `<script>`, so it may not
`import` cleanly as an ES module. Two acceptable approaches — pick one and note it:

1. **Preferred:** add `d3-force` (and, if needed, `d3-quadtree`, `d3-dispatch`,
   `d3-timer`) as a **`devDependencies`** entry used *only by tests*. This keeps
   the **runtime** zero-dep (the browser uses the vendored global; `devDependencies`
   are never shipped to users of the CLI). `forces.js` takes `d3` as an **injected
   argument** (doc 3.4) — it never imports d3 itself — so:
   - the test builds a `d3`-shaped object from the devDep, e.g.
     `import * as d3 from 'd3-force';` then calls `forces.build(d3, …)`;
   - the browser calls `forces.build(window.d3, …)`.
   The same `forces.js` runs unchanged in both. (If the test needs more force
   factories than `d3-force` exports, either add the sibling `d3-*` devDeps or
   assemble the object from them — but never import them inside `forces.js`.)
2. **Alternative (no devDep):** load the vendored UMD file in the test with a tiny
   shim that evaluates it and grabs the `d3` global (e.g. run it in a `node:vm`
   context, or wrap it to assign to `globalThis.d3`), then use `globalThis.d3`.
   More fiddly; use only if adding a devDependency is unacceptable.

> Whichever you choose, **runtime stays zero-dependency** — the shipped browser
> app always uses `public/vendor/d3.v7.min.js`. `devDependencies` do not violate
> the "zero runtime deps" rule; they are not installed by end users of the
> published CLI.

## 5.4 Shared test fixture

Put a tiny deterministic graph in `test/fixtures/graph.mjs` so model/force/sim
tests don't depend on the real db:

```js
export const apiData = {
  view: 'filedeps',
  nodes: [
    { id: 'a', label: 'a.js', kind: 'file', size: 10, path: 'src/a.js' },
    { id: 'b', label: 'b.js', kind: 'file', size: 3,  path: 'src/b.js' },
    { id: 'c', label: 'c.js', kind: 'file', size: 1,  path: 'src/c.js', external: true },
  ],
  edges: [
    { source: 'a', target: 'b', weight: 2 },
    { source: 'a', target: 'c', weight: 1 },
  ],
  truncated: false,
};
```

## 5.5 Unit-test inventory (what must exist by the end)

| File | Asserts |
|------|---------|
| `test/server.test.mjs` | `/` html; `/api/meta` shape; `/api/graph?view=architecture` shape; 404 for unknown; **static files served with correct content-type**; **path traversal blocked** (`..`, encoded `..`) returns 404 and never leaks `src/`. |
| `test/graphModel.test.mjs` | degree counts; radius in `[R_MIN,R_MAX]`; mass monotonic in importance; color by kind; `size` missing → degree fallback; `external` preserved; **edges to absent nodes are dropped**; **missing `weight` defaults to 1**. |
| `test/forces.test.mjs` | `build(d3,…)` (d3 injected) sets charge/link/center per settings; `apply` retunes without replacing nodes; params reflect `repelForce`/`linkForce`/`linkDistance`/`centerForce`. |
| `test/settings.test.mjs` | defaults in range; clamp bounds every slider; serialize↔deserialize round-trips; unknown keys dropped; every panel control has a SCHEMA entry. |
| `test/theme.test.mjs` | `THEMES.dark` and `THEMES.black` have identical, complete key sets (all doc 2.1 tokens). |
| `test/simulation.test.mjs` | with d3 injected, after convergence all node `x/y` finite (no NaN); bounding box non-degenerate; disconnected/external node still finite; a fixture with a truncated (dangling) edge does not throw. |

## 5.6 Manual browser checklists

Launch with `node bin/cli.mjs` inside this repo (it has its own `.codegraph/`),
open the printed `http://localhost:PORT`. On Windows the browser may not
auto-open (see doc 6) — open the URL manually.

### Phase 3 checklist — canvas + force renders
- [ ] App loads with **no network** after first load (disconnect, hard-reload → still works; proves d3 is vendored).
- [ ] `architecture` view shows nodes that **move and then settle**.
- [ ] `file deps` and `call graph` tabs each render their graph.
- [ ] Nodes are colored by kind (folder purple, file amber, function teal, class blue).
- [ ] Links are drawn between connected nodes.
- [ ] Zooming in reveals labels; zooming out hides them.
- [ ] Editing the db (or waiting for a change) triggers live refresh **without** the graph exploding.
- [ ] No Cytoscape script tag remains in `index.html`; DevTools shows no CDN request.

### Phase 4 checklist — interactions & drill
- [ ] Dragging a node moves it and the simulation **reacts** (neighbors follow).
- [ ] Wheel zooms centered on cursor; dragging empty space pans.
- [ ] Hovering a node highlights its neighborhood and **dims** the rest.
- [ ] `architecture`: clicking a **folder** drills in (breadcrumb grows); clicking a **leaf** opens its `file deps`.
- [ ] `file deps`: clicking a **file** opens its `call graph`.
- [ ] `call graph`: clicking a node highlights its neighborhood (no navigation).
- [ ] Breadcrumb segments navigate back to the right scope.
- [ ] Dragging a node does **not** trigger a drill on release.

### Phase 5 checklist — theme
- [ ] Toggle flips page **and canvas** between dark (charcoal) and black (OLED).
- [ ] In black mode, background is true `#000`, links/labels still legible.
- [ ] Reload preserves the chosen theme.

### Phase 6 checklist — settings panel
- [ ] **Repel force** slider spreads/compacts the graph live.
- [ ] **Link distance** slider lengthens/shortens edges live.
- [ ] **Link force** and **Center force** sliders visibly change layout.
- [ ] **Node size** and **Link thickness** display sliders scale visuals.
- [ ] **Show labels** / **Text fade** behave.
- [ ] **Filters**: hiding a kind or "external" removes those nodes; re-showing restores.
- [ ] **Theme** toggle works from the panel.
- [ ] **Reset** returns every control to default and re-lays out.
- [ ] Reload **restores all settings**.

### Phase 7 checklist — performance & polish
- [ ] After the graph settles (Animate off), CPU/GPU drops to ~idle (sim stops ticking).
- [ ] Interacting (drag/slider) resumes animation, then it settles again.
- [ ] Resizing the window keeps the canvas crisp (no blur) and re-centers sensibly.
- [ ] The largest available view stays responsive to zoom/drag.
- [ ] `README.md` no longer says the frontend is a shell / Cytoscape TODO.

## 5.7 The per-phase gate, in one line

> **A phase is done only when:** its unit tests are written and green
> (`node --test`), its browser checklist (if any) fully passes, the app still
> launches, and none of the invariants in doc 6 were violated.
