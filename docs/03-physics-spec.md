# 3 — Physics Spec

This is the exact force model. Numbers here are the **defaults and ranges** that
`settings.js` must define and `forces.js` must apply. An agent should implement
these verbatim, then tune only within the given ranges.

## 3.1 The simulation

Use `d3.forceSimulation(nodes)` with these forces, keyed by name so the panel can
re-tune them live:

| Force name | d3 constructor | Purpose |
|-----------|----------------|---------|
| `link` | `d3.forceLink(links).id(d => d.id)` | pull connected nodes together |
| `charge` | `d3.forceManyBody()` | push all nodes apart (repulsion) |
| `center` | `d3.forceCenter(cx, cy)` **or** paired `forceX(cx)/forceY(cy)` | keep the graph centered |
| `collide` | `d3.forceCollide()` | stop nodes from overlapping |

> Prefer `forceX(cx).strength(k)` + `forceY(cy).strength(k)` over `forceCenter`
> for the **center force** slider, because `forceCenter` has no strength
> parameter — it just recenters the mean. The X/Y pair gives a tunable pull,
> which is what the "center force" slider needs. Keep a `forceCenter` too if you
> like, but the slider drives the X/Y strength.

## 3.2 Per-node gravity / mass

> **graphModel.js must sanitize links before the sim sees them.** d3's
> `forceLink` throws if a link references a node id that isn't in the node set —
> and views can be `truncated`, dropping nodes while keeping edges. So
> `graphModel.build` must (a) build a `Set` of node ids, (b) **drop any edge**
> whose `source` or `target` isn't in that set (the current Cytoscape code does
> exactly this), and (c) default a missing `weight` to `1` (callgraph edges carry
> `kind`, not `weight`). Emit links as `{ source, target, weight }` with string
> ids; `forceLink(...).id(d => d.id)` resolves them.

"Gravity of each node" = how heavy and central a node is. Derive it in
`graphModel.js` from the node's importance:

```
degree(n)      = number of links incident to n   (compute once after building links)
importance(n)  = n.size ?? degree(n) ?? 1         (architecture/filedeps carry `size`;
                                                    callgraph nodes fall back to degree)
radius(n)      = clamp(BASE_R + R_SCALE * sqrt(importance(n)), R_MIN, R_MAX)
mass(n)        = 1 + MASS_SCALE * sqrt(importance(n))
```

Apply mass two ways:

1. **Repulsion scales with mass** — heavier nodes push harder:
   `charge.strength(d => CHARGE_BASE * mass(d))` (CHARGE_BASE is negative).
2. **Collision uses radius** — `collide.radius(d => radius(d) + COLLIDE_PAD)`.

Optionally, give heavy nodes a stronger pull to center (so hubs sit in the
middle like Obsidian): `forceX/forceY.strength(d => CENTER_BASE * (1 + 0.15*Math.log2(1+mass(d))))`.
Keep this subtle; the base center slider still governs the overall pull.

> `radius` is in **graph units**; the renderer multiplies by the display
> `nodeSize` multiplier and the zoom transform.

## 3.3 Defaults and ranges (put these in `settings.js`)

All slider values are **normalized 0..1 in the UI** and mapped to physical force
values in `forces.js`, OR stored directly as physical values — pick one and be
consistent. Below are **physical defaults** and the min/max the panel exposes.

| Setting | Default | Min | Max | Maps to |
|--------|--------:|----:|----:|---------|
| `centerForce` | `0.05` | `0` | `0.30` | `forceX/Y.strength` |
| `repelForce` | `-220` | `-800` | `-30` | `forceManyBody.strength` base (× mass) |
| `linkForce` | `0.35` | `0` | `1` | `forceLink.strength` |
| `linkDistance` | `55` | `10` | `260` | `forceLink.distance` |
| `collidePad` | `2` | `0` | `12` | added to node radius in `forceCollide` |
| `velocityDecay` | `0.35` | `0.10` | `0.90` | `simulation.velocityDecay` (friction) |
| `alphaDecay` | `0.0228` | `0.005` | `0.10` | how fast the layout cools (d3 default `0.0228`) |

Node-shape / display constants (also in `settings.js`, some panel-exposed):

| Constant | Default | Notes |
|---------|--------:|-------|
| `BASE_R` | `3` | min visual radius contribution |
| `R_SCALE` | `1.6` | radius growth per √importance |
| `R_MIN` / `R_MAX` | `3` / `26` | radius clamp (graph units) |
| `MASS_SCALE` | `0.6` | mass growth per √importance |
| `CHARGE_BASE` | `= repelForce` | negative; multiplied by node mass |
| `nodeSize` (display) | `1.0` | `0.5`–`2.0` global radius multiplier |
| `linkThickness` (display) | `1.0` | `0.5`–`3.0` global width multiplier |
| `labelZoom` (text fade) | `1.2` | show labels when zoom scale ≥ this; `0.4`–`4` |

## 3.4 forces.js contract (pure, unit-tested)

**Dependency injection (read this first — it's the #1 trap).** `forces.js` must
**not** hardcode how it gets d3. In the browser, d3 is the global `window.d3`
from the vendored `<script>`; in Node tests there is no such global and the bare
specifier `'d3-force'` won't resolve in the browser. Resolve this by **passing d3
in**: `forces.js` functions take a `d3` argument (the object exposing
`forceSimulation`, `forceLink`, `forceManyBody`, `forceCenter`, `forceX`,
`forceY`, `forceCollide`). Then:

- `main.js` (browser) calls `forces.build(d3, …)` with `window.d3`.
- `forces.test.mjs` / `simulation.test.mjs` (Node) call it with the object
  imported from the `d3-force` **devDependency** (see doc 5.3).

Do **not** put a bare `import … from 'd3-force'` or a bare global `d3` reference
at the top of `forces.js` — either one breaks one of the two environments.

`forces.js` exposes two functions:

```
build(d3, nodes, links, settings, {cx, cy}) -> simulation   // constructs sim + all forces
apply(d3, simulation, settings, {cx, cy})   -> void          // re-tunes existing forces live, reheats alpha
```

- `build` must set every force listed in 3.1 with strengths/distances derived
  from `settings` and per-node `mass`/`radius`.
- `apply` must **not** recreate the simulation or reassign nodes — it reads each
  named force (`sim.force('charge')`, etc.), updates its parameters, then calls
  `sim.alpha(target).restart()` with a modest reheat (e.g. `alphaTarget 0`, set
  `alpha(0.3)`), so sliders feel live without the graph exploding.
- Both functions must be **deterministic given inputs** (no reading of DOM or
  `localStorage`) so they can be unit-tested. What *can* be tested headlessly:
  - `build(...)` returns a sim whose `force('charge').strength()` reflects
    `repelForce`, whose `force('link').distance()`/`.strength()` reflect the
    settings, etc.
  - After running the sim to convergence (`while (sim.alpha() > sim.alphaMin()) sim.tick()`),
    every node has **finite** `x`/`y` (no `NaN`), and the graph's bounding box is
    non-degenerate. See `simulation.test.mjs` in doc 5.

## 3.5 Interaction physics

- **Drag:** on drag start `sim.alphaTarget(0.3).restart()`, set `d.fx=d.x; d.fy=d.y`;
  on drag set `d.fx=pointerX; d.fy=pointerY`; on end `sim.alphaTarget(0)` and
  clear `d.fx=d.fy=null` (unless a "pin on drop" toggle keeps them).
- **Live refresh / view change:** when new data arrives, carry over `x,y,vx,vy`
  for nodes whose `id` matches the previous frame; new nodes start near the
  centroid of their neighbors (or center) so the layout eases instead of jumping.
- **Freeze when settled:** if display `animate` is off and `sim.alpha() <
  sim.alphaMin()`, stop the rAF tick loop; resume it on any slider change, drag,
  hover-that-needs-redraw, or data change.

## 3.6 Performance guidance

- The many-body force uses a Barnes–Hut quadtree by default — fine to a few
  thousand nodes. If a view returns near its `limit` (`truncated:true`), consider
  raising `alphaDecay` slightly so it settles faster.
- Draw on `<canvas>` with a single path batch per style bucket (idle links, then
  highlighted links, then nodes, then labels). Don't create per-node DOM.
- Respect `devicePixelRatio` for crisp rendering; scale the canvas backing store
  and the 2D context once on resize.
