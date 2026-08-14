# 2 — Design Spec (visual & UX)

The look is **Obsidian graph view**: a calm dark field, softly glowing nodes,
thin translucent links, labels that fade in as you zoom, and a compact settings
panel tucked in a corner. This doc defines the tokens and the panel so the
implementation is not left to taste.

## 2.1 Themes

Two themes, toggled from the panel and persisted. Both are dark; the toggle is
**"dark" → "black"** (deep charcoal ↔ true OLED black), as requested.

Tokens live as CSS custom properties on `:root` and are mirrored in `theme.js`
so the **canvas** (which can't read CSS variables directly) draws with the same
values. Keep the two in sync — the token tables in `theme.js` are unit-tested to
contain every key.

| Token | `dark` (default) | `black` | Used for |
|-------|------------------|---------|----------|
| `--bg` | `#0c0f13` | `#000000` | page + canvas background |
| `--bg-panel` | `#12161c` | `#0a0a0a` | panel / header surfaces |
| `--line` | `#1d242d` | `#141414` | borders, separators |
| `--text` | `#c8d0d8` | `#d7dde3` | primary text + node labels |
| `--muted` | `#6b7682` | `#5a5f66` | secondary text |
| `--link` | `rgba(138,155,176,.35)` | `rgba(120,132,150,.30)` | idle link stroke |
| `--link-hi` | `#38e1c6` | `#38e1c6` | highlighted link/node |
| `--node-stroke` | `rgba(255,255,255,.10)` | `rgba(255,255,255,.06)` | node outline |
| `--glow` | `rgba(56,225,198,.25)` | `rgba(56,225,198,.20)` | hover/selection glow |

Node **fill** colors are by `kind` and shared across themes (they already exist
in the current frontend — keep them):

| kind | color |
|------|-------|
| folder / module | `#c98cff` |
| file | `#f5b14c` |
| function / method | `#38e1c6` |
| class / interface | `#6aa6ff` |
| external / unknown | `#4a5560` / `#6b7682` (dimmed) |

## 2.2 Nodes

- **Shape:** filled circle. Radius from `graphModel.js` (see physics doc): a base
  radius plus a compressed function of `size`/degree, clamped `[3, 26]` px in
  graph units.
- **Outline:** 1px `--node-stroke`. Focused node (`focus:1`): 2px `--link-hi`.
  Expandable folder (`expandable:1`): 1.5px dashed `#c98cff`.
- **Hover / selection:** node scales ~1.15×, gains a soft `--glow` (drawn as a
  radial gradient or a shadow ring), and its neighborhood highlights (below).
- **External nodes** (`external:true`): dimmed fill + lower opacity, per current
  behavior.

## 2.3 Links

- **Stroke:** `--link`, width = `linkThickness × f(weight)` where
  `f(weight)=1+log2(1+weight)`, clamped `[0.5, 4]` px.
- **Style:** straight lines by default (curved is an optional display toggle;
  straight is cheaper and reads cleaner at Obsidian scale).
- **Direction:** call/dep edges are directional. Draw a subtle arrowhead **only
  when zoomed in past a threshold** (arrowheads are noise when zoomed out) — or
  skip arrowheads and rely on a slight source→target alpha taper. Either is
  acceptable; taper is cheaper. Document which you chose in code.
- **Highlight:** on node hover, the node's incident links + neighbor nodes go to
  full opacity and `--link-hi`; everything else dims to ~10% opacity (mirrors the
  current `.faded`/`.highlight` behavior).

## 2.4 Labels

- Font: `ui-monospace, "SF Mono", Menlo, monospace`, `--text`.
- **Zoom-gated:** labels are hidden below a zoom threshold and fade in above it
  (Obsidian behavior). A "text fade" slider controls the threshold.
- Only draw labels for nodes whose radius/importance clears a cutoff when the
  graph is dense, to avoid a wall of text. Always draw the hovered/selected label.
- Position: centered under the node.

## 2.5 The settings panel (Obsidian-style)

A **floating, collapsible panel** anchored bottom-left of the graph area
(`position:absolute`), semi-transparent `--bg-panel`, thin `--line` border,
rounded corners. A small gear/“⚙ settings” toggle collapses/expands it. Its
contents are grouped, each group collapsible:

**Filters**
- Search box (reuses `/api/search`) to focus/center a node.
- `kind` toggles: checkboxes to show/hide node kinds (drives a filter in
  `graphModel`/`render`).
- "Show external nodes" toggle.

**Groups (color)**
- Read-only legend mapping `kind → color` (see 2.1). (Custom color groups are a
  stretch goal; not required for "done".)

**Display**
- **Show labels** (on/off) + **Text fade** (zoom threshold slider).
- **Node size** (global scale multiplier).
- **Link thickness** (global multiplier).
- **Animate** (whether the sim keeps ticking or freezes when settled).
- **Curved links** (on/off).

**Forces** (the core Obsidian sliders — wired live to the running simulation)
- **Center force** — pull toward canvas center.
- **Repel force** — many-body charge (node-node repulsion).
- **Link force** — link strength.
- **Link distance** — desired edge length.
- Each is a range input with a numeric readout; changing it calls
  `forces.apply(sim, settings)` and gently reheats the sim (`alpha`).

**Theme**
- A **dark ⇄ black** toggle (segmented control or switch).

**Footer**
- **Reset to defaults** button (restores `settings.js` defaults + re-lays out).

### Panel behavior

- Every control reads/writes the single `settings` object (doc 1) and persists
  via `settings.js` to `localStorage` under one key (e.g. `cgviz.settings.v1`).
- On load, settings are restored, clamped to valid ranges, and applied before the
  first layout.
- Ranges and defaults are defined **once** in `settings.js` (doc 3 gives the
  numbers) and the panel builds its inputs from that schema — do not hardcode
  min/max in the DOM.

## 2.6 Header, tabs, breadcrumbs (keep)

The existing header (brand, three view tabs, live-dot + counts) and the
breadcrumb bar stay as-is visually; only their theme colors come from tokens now.
The three tabs and the breadcrumb drill navigation must keep working exactly as
today (doc 6 lists this as an invariant).

## 2.7 Motion & feel

- Simulation runs on `requestAnimationFrame`; when `alpha` drops below a floor
  and "Animate" is off, stop ticking and only redraw on interaction (saves CPU).
- Dragging a node fixes it (`fx/fy`) and reheats the sim; releasing frees it
  (unless "pin on drop" — optional).
- Zoom/pan is smooth via `d3-zoom`; wheel sensitivity tuned low (matches the
  current `wheelSensitivity: .2` intent).
- No layout "explosion" on live refresh: reuse prior positions for matching ids.
