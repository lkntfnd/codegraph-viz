# codegraph-viz — Obsidian-style graph docs

This folder is the **complete background plan** for turning the current static
Cytoscape graph into a live, Obsidian-style force-directed graph rendered on
canvas, with a full settings panel and a dark→black theme toggle.

It is written so that an implementing agent (including a smaller-reasoning one)
can execute the roadmap **top to bottom without improvising** and without
breaking the working tool. Read the docs in order:

| # | Doc | What it gives you |
|---|-----|-------------------|
| 0 | [00-overview.md](00-overview.md) | Vision, current state, goals, glossary. Start here. |
| 1 | [01-architecture-and-stack.md](01-architecture-and-stack.md) | The chosen stack (d3-force + canvas, vendored offline), file layout, data flow, and the decisions behind them. |
| 2 | [02-design-spec.md](02-design-spec.md) | Visual language: themes, node/link styling, typography, and the settings-panel UX. |
| 3 | [03-physics-spec.md](03-physics-spec.md) | The force simulation: every force, per-node gravity/mass, defaults, and tuning ranges. |
| 4 | [04-roadmap.md](04-roadmap.md) | **The build.** Eight phases, each a testable increment with a red→green→verify gate. |
| 5 | [05-testing-and-verification.md](05-testing-and-verification.md) | The `node:test` backbone, what is unit-tested vs. manually verified, and the exact checklists. |
| 6 | [06-agent-playbook.md](06-agent-playbook.md) | Guardrails, invariants, and the specific blunders to avoid. Re-read before every phase. |

## Non-negotiables (the short version)

1. **The database is read-only. Never write to it.** (`.codegraph/codegraph.db`)
2. **Zero runtime npm dependencies.** All browser libraries are *vendored* into
   `public/vendor/` and served locally — no CDN, works offline.
3. **Never break the existing HTTP API or the drill-down navigation.** The three
   views (architecture → file deps → call graph) and their click-to-drill
   behavior must survive the rewrite unchanged.
4. **Every phase ends green.** `node --test` passes and the app still launches
   before you start the next phase.

## Decisions locked with the project owner

- **Target surface:** browser graph (launched from the terminal via
  `codegraph-viz`), *not* a terminal TUI.
- **Engine:** swap Cytoscape → **d3-force simulation drawn on a `<canvas>`**.
- **Dependencies:** **vendored, offline-first.** Commit the library into the repo.
- **Controls:** the **full Obsidian-style settings panel** (force sliders,
  display toggles, filters, groups), plus the dark→black theme toggle.
- **Tests:** none exist in the repo today. A lightweight `node:test` harness is
  introduced in Phase 0 as the verification backbone — see doc 5.
