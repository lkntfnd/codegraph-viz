# 6 — Agent Playbook (guardrails)

Read this **before every phase**. It exists so a smaller-reasoning agent can run
the roadmap end-to-end without the classic blunders. If anything here conflicts
with something you're about to do, **stop and re-read**.

## 6.1 Invariants — never violate these

1. **The database is read-only.** Open only via `src/db.mjs` (`readOnly:true`).
   Never write, migrate, or "fix" `.codegraph/codegraph.db`. The tool's whole
   premise is non-destructive observation.
2. **Zero runtime npm dependencies.** The published CLI must run with no
   `npm install`. Browser libraries are **vendored** into `public/vendor/` and
   committed. `devDependencies` used only by `node --test` are allowed (end users
   never install them) — nothing else.
3. **Do not change the HTTP API contract.** The routes and JSON shapes in
   [00-overview.md](00-overview.md) §0.1 are consumed as-is. The only backend
   change in this whole plan is *adding* static-file serving (Phase 1). If you
   feel you must change `/api/graph`'s output, you've misunderstood — the frontend
   adapts to the data, not the reverse.
4. **Preserve the three views and drill navigation exactly.** `architecture →
   (folder) architecture / (leaf) filedeps`, `filedeps → (file) callgraph`,
   `callgraph → highlight`. The source of truth is the current
   `public/index.html` `cy.on('tap','node', …)` block and the breadcrumb handler.
   Diff your behavior against it in Phase 4.
5. **Every phase ends green and launchable.** `node --test` passes and
   `node bin/cli.mjs` still serves the app before you start the next phase.
6. **Small steps, committed per phase.** One phase = one coherent change set. Do
   not batch phase 3+4+5 together — you lose the ability to localize a regression.
7. **Cross-platform paths.** Build every path with `node:path`. Never assume `/`
   or a POSIX shell.

## 6.2 Order is not optional

Phases 0→1→2→3 are a strict chain (harness → serving → pure logic → render).
4, 5, 6, 7 come after 3 in that order. The dependency graph is at the end of
[04-roadmap.md](04-roadmap.md). Skipping ahead (e.g. building the panel before the
canvas exists) will strand you.

## 6.3 Test-first discipline

For the **pure** work (server static guard, graphModel, forces, settings, theme
tables, simulation convergence): **write the test first, watch it fail, then
implement.** These are listed with exact assertions in
[05-testing-and-verification.md](05-testing-and-verification.md) §5.5. For the
**canvas/DOM** work, the manual checklist *is* the gate — run it honestly, tick
every box, don't self-certify from code reading.

## 6.4 The specific blunders to avoid

- **Keeping Cytoscape "just in case."** It's a CDN dependency; leaving it breaks
  offline-first and bloats the page. Remove it fully in Phase 3 once the canvas
  reaches parity.
- **Fetching d3 at runtime.** Vendor it (commit the file). No CDN `<script>`.
- **Wrong content-type for modules.** `.js` must be served as `text/javascript`
  (or `application/javascript`), or `type="module"` scripts silently fail to load.
- **Path traversal in the static handler.** Resolve the final path and confirm it
  is inside `PUBLIC`. URL-decode *before* checking. Test with `..` and `%2e%2e`.
- **Importing d3 inside `forces.js`.** A bare `import … from 'd3-force'` breaks
  the browser (can't resolve the specifier); a bare global `d3` breaks Node tests.
  Pass `d3` in as an argument (doc 3.4). This is the single most likely place to
  get stuck — handle it exactly as documented.
- **Feeding dangling edges to `forceLink`.** It throws when a link references a
  node id that isn't in the node set, and views can be `truncated`. `graphModel`
  must drop those edges and default missing `weight` to 1 (doc 3.2 note).
- **Rebuilding the simulation on every slider tick.** That re-seeds node
  positions and the graph jumps. Use `forces.apply()` to retune the *existing*
  sim (doc 3.4).
- **Layout explosion on live refresh / view change.** Carry over `x,y,vx,vy` for
  nodes whose `id` matches the previous frame (doc 3.5).
- **Firing a drill on drag-release.** Disambiguate click vs. drag by movement
  threshold; only a genuine click drills.
- **Hardcoded canvas colors.** All canvas colors come from the active theme table,
  or "black" mode leaks charcoal.
- **Duplicating the settings ranges** in the DOM. `settings.SCHEMA` is the single
  source; the panel builds inputs from it.
- **Ticking the simulation forever.** Freeze when settled; resume on interaction.
- **Blurry canvas.** Handle `devicePixelRatio` on init and resize.
- **Asserting exact node counts** in tests. The db changes; assert shapes/types,
  not magic numbers.

## 6.5 Known environment gotchas

- **Browser auto-open is macOS-only.** `src/commands/serve.mjs` calls
  `exec('open ${url}')`. On Windows/Linux this does nothing (or errors quietly);
  open the printed URL manually when verifying. Phase 7 has an *optional* fix:
  choose the opener by platform (`start ""` on win32, `open` on darwin,
  `xdg-open` on linux). Only do it if asked / as the documented optional step —
  it is not required for the feature.
- **SQLite driver.** Node ≥24 has `node:sqlite` built in; on 22.5–23 you may need
  `node --experimental-sqlite`. Don't "fix" this by adding `better-sqlite3` as a
  hard dependency — it's an optional fallback the code already handles.
- **WAL sidecar.** `dbMtime` already accounts for `-wal`; live refresh relies on
  it. Don't change that logic.

## 6.6 Definition of Done — the whole feature

- [ ] All phase checklists in [05-testing-and-verification.md](05-testing-and-verification.md) pass.
- [ ] `node --test` green; unit-test inventory (§5.5) complete.
- [ ] App runs **offline** (vendored d3), no CDN requests in DevTools.
- [ ] All three views render as a live, draggable, zoomable Obsidian-style graph.
- [ ] Full settings panel: force sliders, display toggles, filters, theme, reset — all live and persisted.
- [ ] Dark ⇄ black theme toggle themes DOM **and** canvas, persisted.
- [ ] Per-node gravity/mass visibly makes hubs central and heavy (doc 3).
- [ ] Drill navigation identical to the original.
- [ ] `README.md` updated; no stale "shell/TODO" text.
- [ ] Database never written; API contract unchanged; zero runtime deps.

## 6.7 If you get stuck

- **Schema errors** (`schema-not-detected`, empty graph): that's a *data* problem,
  not your rendering — check `/api/schema` and `src/db.mjs` CONFIG, per the README.
  Don't rewrite the backend to compensate.
- **Something in the API isn't shaped how the frontend wants:** adapt in
  `graphModel.js` (a pure, tested transform), not in the server.
- **A phase's checklist won't pass:** do not proceed. Localize the regression to
  the current phase's diff (that's why phases are small and committed separately).
