# 4 — Roadmap

Eight phases. Each is a **small, independently verifiable increment** with a
red→green→verify gate. Do them **in order**. Do not start a phase until the
previous phase's "Definition of Done" is fully met and `node --test` is green.

**How to read a phase:** *Goal* (what changes) → *Why order* → *Files* →
*Steps* (test-first where the logic is pure) → *Gate* (how you prove it works) →
*Done* (checklist) → *Blunders* (what not to do).

> Testing note: The pure-logic phases (0,1,2,5-part,6-part) are genuinely
> test-first. The canvas/DOM phases (3,4, panel parts of 6, 7) cannot be
> pixel-unit-tested — they use the **manual browser checklists** in doc 5 as their
> gate, plus headless simulation tests for the physics underneath them. This is
> deliberate, not a shortcut.

---

## Phase 0 — Safety net & harness

**Goal:** Add the `node:test` harness and lock current behavior with
characterization tests. **No behavior change.**

**Why first:** You cannot safely refactor the frontend or touch the server
without a way to prove you didn't break the API. This phase creates that proof.

**Files:** `package.json` (add `"test": "node --test"`), `test/server.test.mjs`.

**Steps:**
1. Add the test script to `package.json`:
   `"scripts": { …, "test": "node --test" }`.
2. Write `test/server.test.mjs` that imports `createServer` from
   `src/server.mjs`, starts it on an ephemeral port against the repo's own
   `.codegraph/codegraph.db`, and asserts the **current** contract:
   - `GET /` returns 200 and `text/html`.
   - `GET /api/meta` returns 200 and an object with numeric `nodeCount` and
     `edgeCount` (or an `error` string if schema undetected — assert one or the other).
   - `GET /api/graph?view=architecture` returns `{ view:'architecture', nodes:[…], edges:[…] }`.
   - `GET /api/nope` returns 404.
3. Run `node --test`. It should pass against today's code (these describe
   existing behavior).

**Gate:** `node --test` passes; you changed no `src/` logic.

**Done:**
- [ ] `npm test` / `node --test` runs and is green.
- [ ] `test/server.test.mjs` covers the 4 assertions above.
- [ ] `git diff src/` is empty (only `package.json` + `test/` added).

**Blunders:** Don't hardcode counts from your machine's db (assert *shape/types*,
not exact numbers). Don't leave the server listening — close it in an `after` hook.

---

## Phase 1 — Static file serving + vendor d3 (backend)

**Goal:** Teach `src/server.mjs` to serve files under `public/` safely, then
vendor d3 and confirm it's served. Frontend still runs on Cytoscape — unchanged.

**Why order:** The new frontend needs to load `public/vendor/d3.v7.min.js` and
`public/app/*.js`. The server currently serves *only* `index.html` and `/api/*`.
This must exist before any new frontend file can load.

**Files:** `src/server.mjs`, `public/vendor/d3.v7.min.js` (new, committed),
`test/server.test.mjs` (extend).

**Steps (test-first):**
1. **Red:** add tests to `test/server.test.mjs`:
   - `GET /styles.css` (create a tiny placeholder `public/styles.css` first, or
     assert on the vendored js in step 3) → 200 + `text/css`.
   - `GET /vendor/d3.v7.min.js` → 200 + a JavaScript content-type + non-empty body.
   - **Traversal is blocked:** `GET /../src/server.mjs` and
     `GET /%2e%2e/src/server.mjs` and `GET /vendor/../../src/db.mjs` → 404 (or
     400), and the body must **not** contain source from `src/`.
   - `GET /app/does-not-exist.js` → 404.
   Run — these fail (red).
2. **Green:** implement a static handler in the request callback, *after* the
   API routes and *before* the 404. Algorithm:
   - Only handle `GET`/`HEAD`.
   - Decode the pathname, reject if it contains `\0`.
   - `const filePath = join(PUBLIC, '.' + p)` then
     `const resolved = resolve(filePath)`; **reject unless `resolved` starts with
     `resolve(PUBLIC) + sep`** (or equals PUBLIC/index.html). This is the
     traversal guard.
   - `stat` it; if missing or a directory (other than mapping `/`→`index.html`,
     already handled) → fall through to 404.
   - Read and send with `contentType(ext)`; add a small `Content-Type` map.
3. Vendor d3: download the **d3 v7 UMD bundle** once and commit it:
   - Fetch `https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js` (or the unpkg
     equivalent) and save as `public/vendor/d3.v7.min.js`. Verify it defines a
     global `d3` (top of file mentions `d3` UMD). Record the exact version in a
     one-line `public/vendor/README.md`.
   - This file is committed to the repo (offline-first). It is **not** an npm dep.
4. Run `node --test` → green.

**Gate:** tests green; `curl localhost:PORT/vendor/d3.v7.min.js` returns the
library; traversal attempts 404; the app still loads as before.

**Done:**
- [ ] Static handler serves `public/**` with correct content types.
- [ ] Path traversal is provably blocked (tests assert it).
- [ ] `public/vendor/d3.v7.min.js` committed; version noted.
- [ ] Existing routes and Cytoscape frontend still work.

**Blunders:** Don't serve files outside `PUBLIC`. Don't forget URL-decoding
before the traversal check (encoded `..` must be caught). Don't set a wrong
content-type for `.js` (browsers refuse `type="module"` scripts served as
`text/plain`). Don't fetch d3 at runtime — it must be committed.

---

## Phase 2 — Extract pure frontend logic (no visual change)

**Goal:** Create and unit-test the pure modules — `graphModel.js`, `settings.js`,
`forces.js`, `theme.js` — with **no wiring into the page yet**. Cytoscape still
renders.

**Why order:** These are the testable heart of the feature. Building and proving
them before touching the canvas means the risky visual phase (3) rests on
verified logic.

**Files:** `public/app/graphModel.js`, `public/app/settings.js`,
`public/app/forces.js`, `public/app/theme.js`, and their tests in `test/`.

**Steps (test-first for each):**
1. `settings.js` — export `DEFAULTS`, `SCHEMA` (min/max per key from doc 3),
   `clamp(settings)`, `serialize/deserialize` (pure; deserialize takes a string,
   not `localStorage`). Test: defaults are in-range; out-of-range values clamp;
   round-trip serialize→deserialize is identity; unknown keys are dropped.
2. `graphModel.js` — export `build(apiData, settings)` →
   `{ nodes:[{…, degree, mass, radius, color}], links:[{source,target,weight}] }`.
   Pure; no DOM. Test with a small fixture (see doc 5): degree counts correct;
   radius within `[R_MIN,R_MAX]`; mass monotonic in importance; color matches the
   kind map; `external` handled; missing `size` falls back to degree.
3. `forces.js` — export `build(nodes, links, settings, dims)` and
   `apply(sim, settings, dims)` per doc 3.4. Import the **vendored d3** in tests
   via a Node-visible path (see doc 5 §"Testing d3 in Node"). Test: constructed
   sim's force params reflect settings; `apply` mutates them without replacing
   nodes.
4. `theme.js` — export `THEMES = { dark:{…tokens}, black:{…tokens} }` and
   `apply(themeName, rootEl?)`. The **token tables** are unit-tested: both themes
   define the exact same key set (doc 2.1); `apply` is only exercised in the
   browser. Test: `Object.keys(THEMES.dark)` deep-equals `Object.keys(THEMES.black)`
   and includes every required token.

**Gate:** `node --test` green; new modules imported by nothing in the page yet
(so the app is byte-for-byte unchanged in the browser).

**Done:**
- [ ] Four pure modules exist with passing unit tests.
- [ ] No change to `index.html` behavior (Cytoscape still active).

**Blunders:** Don't read `localStorage`, `window`, or `document` in these modules
— keep them pure so they test headlessly (the *panel* and *main* do the I/O).
Don't duplicate the ranges in multiple files; `settings.js` is the single source.

---

## Phase 3 — Canvas renderer + live d3-force (the swap)

**Goal:** Replace the Cytoscape render path with a d3-force simulation drawn on
`<canvas>`. Build it **alongside** the old path, switch over, then delete
Cytoscape once at parity.

**Why order:** Everything it needs (static serving, vendored d3, model, forces)
now exists and is tested.

**Files:** `public/app/render.js`, `public/app/main.js`, `public/app/api.js`,
`public/index.html` (swap `<div id="graph">`→`<canvas id="graph">`, swap the
inline `<script>` for `<script type="module" src="/app/main.js">`, drop the
Cytoscape CDN `<script>`), `public/styles.css` (move the inline CSS here),
`test/simulation.test.mjs`.

**Steps:**
1. **Headless first (red→green):** write `test/simulation.test.mjs` — build the
   model + sim from a fixture, run to convergence, assert all positions finite
   and bounding box non-degenerate (doc 3.4). Green before touching the DOM.
2. `api.js` — port the existing fetch helpers (`/api/meta`, `/api/graph`,
   `/api/version`, `/api/search`) verbatim from today's inline script.
3. `render.js` — a `draw(ctx, model, transform, theme, settings, hover)` function:
   clear with `--bg`; draw idle links, then nodes, then labels (zoom-gated).
   Respect `devicePixelRatio`. No simulation logic here — it only paints.
4. `main.js` — wire it: fetch view → `graphModel.build` → `forces.build` →
   `requestAnimationFrame` loop that `sim.tick()`s and calls `render.draw`. Port
   the tab switching, breadcrumb rendering, and the `/api/version` poll from the
   old inline script **unchanged in behavior**.
5. Convert `index.html`: `<canvas id="graph">`, remove the Cytoscape `<script>`,
   add `<link rel="stylesheet" href="/styles.css">` and
   `<script type="module" src="/app/main.js"></script>`. Move CSS to `styles.css`
   using the theme tokens from `theme.js`/doc 2.
6. Delete the old inline render + Cytoscape references **only after** the browser
   checklist (doc 5) passes for all three views.

**Gate:** headless sim test green **and** the **Phase 3 browser checklist**
(doc 5) passes: all three views render a moving-then-settling graph, nodes are
colored by kind, links draw, labels appear on zoom, live-refresh still works.

**Done:**
- [ ] Canvas graph renders all three views with live physics.
- [ ] `/api/version` live refresh reuses positions (no explosion).
- [ ] Cytoscape CDN and code fully removed; app works **offline** (disconnect
      network, reload — it still loads because d3 is vendored).
- [ ] `node --test` green.

**Blunders:** Don't keep Cytoscape "just in case" — dead CDN dependency defeats
offline. Don't compute layout on every draw — the sim owns positions; draw reads
them. Don't forget `devicePixelRatio` (blurry canvas). Don't break the drill
click targets — but full drill interaction is Phase 4; here just don't regress
tab/breadcrumb navigation.

---

## Phase 4 — Interactions & drill navigation

**Goal:** Add drag, zoom/pan, hover-neighborhood highlight, and restore the
**click-to-drill** semantics on canvas.

**Why order:** Rendering must be stable before layering interaction math on top
of the zoom transform.

**Files:** `public/app/interactions.js`, `public/app/main.js` (wire),
`public/app/render.js` (highlight/dim states).

**Steps:**
1. **Zoom/pan:** attach `d3.zoom()` to the canvas; keep the transform in state;
   apply it in `render.draw`. Tune `wheelDelta` for gentle zoom (match old
   `wheelSensitivity: .2` feel).
2. **Hit-testing:** map pointer → graph coords via the inverse transform; find
   the nearest node within its radius. (Simple linear scan is fine at these
   sizes; a quadtree is optional.)
3. **Drag:** on a node hit, run the drag physics from doc 3.5 (`fx/fy`, reheat).
4. **Hover highlight:** on hover, compute the node's closed neighborhood; set
   render into highlight/dim mode (mirror the old `.faded`/`.highlight`).
5. **Click-to-drill — preserve exactly (doc 6 invariant):**
   - `architecture`: click folder (`expandable`) → drill `state.prefix=path`,
     reload `architecture`; click a leaf → reload `filedeps` at that path.
   - `filedeps`: click a file → `state.file=path`, reload `callgraph`.
   - `callgraph`: click → highlight neighborhood (no navigation).
   - Distinguish a **click** from a **drag** (movement threshold / timing) so
     dragging a node doesn't trigger a drill.

**Gate:** **Phase 4 browser checklist** (doc 5): drag moves a node and the sim
reacts; wheel zooms, drag-empty pans; hover highlights a neighborhood and dims
the rest; every drill path in all three views lands on the correct view/scope;
breadcrumb back-navigation works.

**Done:**
- [ ] Drag, zoom, pan, hover-highlight all work on canvas.
- [ ] All drill paths reproduce today's navigation exactly.
- [ ] Click vs. drag disambiguated.
- [ ] `node --test` still green.

**Blunders:** The #1 blunder — **losing the drill navigation.** Verify every path
against the current `index.html` `cy.on('tap', 'node', …)` logic (lines ~186-199)
before you call this done. Don't fire a drill on the mouseup that ends a drag.

---

## Phase 5 — Theme system (dark → black)

**Goal:** Wire `theme.js` so the dark⇄black toggle re-themes both the DOM and the
canvas, and persists.

**Why order:** Rendering + interactions are stable; theming is a clean overlay.

**Files:** `public/app/theme.js` (already built+tested in Phase 2 — now *used*),
`public/app/main.js`, a temporary toggle button (folds into the panel in Phase 6),
`public/styles.css`.

**Steps:**
1. On load, read saved theme (default `dark`) and `theme.apply(name)` — sets CSS
   variables on `:root` and stores the active token table for the canvas.
2. `render.draw` reads colors from the active theme tokens (not hardcoded).
3. Add a toggle; on change, `theme.apply`, persist, and request a redraw.

**Gate:** toggling flips page + canvas between deep-charcoal and true black;
reload preserves the choice; both themes are legible (labels, links, nodes).

**Done:**
- [ ] Dark and black themes both fully applied to DOM **and** canvas.
- [ ] Choice persists across reload.
- [ ] `node --test` green (theme token-table tests still pass).

**Blunders:** Don't leave any canvas color hardcoded — every color the canvas
draws must come from the theme table, or "black" mode will show charcoal links.

---

## Phase 6 — Full settings panel

**Goal:** Build the Obsidian-style panel (doc 2.5) and wire every control to
`settings.js` (persisted) and to the live simulation via `forces.apply`.

**Why order:** All the pieces it drives (forces, theme, display, filters) now
exist and are proven.

**Files:** `public/app/panel.js`, `public/app/main.js` (wire), `public/index.html`
(panel container), `public/styles.css`, extend `test/settings.test.mjs`.

**Steps:**
1. Build the panel DOM **from `settings.SCHEMA`** (min/max/step/label per control)
   — no hardcoded ranges in markup.
2. Groups: Filters, Groups(legend), Display, Forces, Theme, Reset (doc 2.5).
3. Bind each control: on input → update `settings` → `settings.clamp` →
   persist → apply. Forces call `forces.apply(sim, settings, dims)` (live
   reheat). Display toggles set render flags. Filters update the model/render.
   Theme uses Phase 5. Reset restores `DEFAULTS` and re-lays out.
4. Restore persisted settings on load and apply before first layout.
5. Extend `settings.test.mjs`: any new keys have schema entries; clamp covers
   every slider's bounds.

**Gate:** **Phase 6 browser checklist** (doc 5): each force slider visibly
retunes the live graph; display toggles work; filters hide/show kinds & external;
theme toggle lives here now; Reset restores defaults; all settings persist across
reload.

**Done:**
- [ ] Every control in doc 2.5 present and wired.
- [ ] Ranges come solely from `settings.SCHEMA`.
- [ ] Persistence + Reset work.
- [ ] `node --test` green.

**Blunders:** Don't rebuild the simulation on every slider tick (recreates nodes,
loses positions) — use `forces.apply`. Don't persist un-clamped values. Don't
duplicate the schema in the DOM.

---

## Phase 7 — Performance, polish & docs

**Goal:** Make it smooth and finish the housekeeping.

**Files:** `public/app/*` (tuning), `README.md`, `docs/*` (update status),
`src/commands/serve.mjs` (optional cross-platform open fix — see doc 6).

**Steps:**
1. **Freeze when settled** (doc 3.5): stop the rAF loop when `alpha<alphaMin` and
   `animate` is off; resume on interaction/data/slider change.
2. **Label culling** on dense graphs; always draw hovered/selected labels.
3. **DPR + resize** handling verified; single quadtree pass for many-body.
4. Update `README.md`: remove the "frontend is a shell / Cytoscape render hook
   marked TODO" language; document the settings panel, themes, and offline use.
5. Mark the roadmap phases complete in this folder.
6. *(Optional, recommended)* Fix `serve.mjs` browser-open to be cross-platform
   (doc 6) so it works on Windows/Linux, not just macOS `open`.

**Gate:** **Phase 7 browser checklist** (doc 5): large view stays responsive,
CPU drops to ~idle after the graph settles, resize stays crisp, README matches
reality.

**Done:**
- [ ] Idle CPU near zero after settle; smooth interaction on the biggest view.
- [ ] README and docs updated; no stale "shell/TODO" text.
- [ ] `node --test` green.

**Blunders:** Don't leave the sim ticking forever (battery/CPU). Don't ship
README text that contradicts the built feature.

---

## Phase dependency summary

```
0 (harness) → 1 (static+vendor) → 2 (pure modules) → 3 (canvas+force)
                                                        → 4 (interactions/drill)
                                                        → 5 (theme)
                                                        → 6 (settings panel)
                                                        → 7 (perf/docs)
```

4, 5 both build on 3; 6 builds on 4+5; 7 last. Never reorder 0→1→2→3.
