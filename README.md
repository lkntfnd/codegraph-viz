# codegraph-viz

Local, offline-first visualizer for [codegraph](https://github.com/colbymchenry/codegraph)
knowledge graphs. It opens an indexed project's `.codegraph/codegraph.db`
**read-only** and serves three linked views—architecture, file dependencies, and
call graph—in your browser.

The frontend is implemented with native CSS and Canvas, with a live D3 force
simulation, zoom/pan, drag-reactive nodes, neighborhood highlighting, an
Obsidian-style settings panel, and persistent dark/black themes. It has no CDN
requests and no installed runtime dependencies.

## Requirements

- **Node 22.13 or newer**. Node 24 is recommended.
- A target project that has already been indexed with `codegraph init`.

`node:sqlite` is available without a feature flag from Node 22.13. The
`codegraph-viz` repository itself does not need a `.codegraph/` directory; only
the project you choose to visualize does.

## Install

Install the CLI globally from npm:

```bash
npm install -g @fdslk/codegraph-viz
```

The command is `codegraph-viz`. Upgrade by re-running the install; uninstall
with `npm uninstall -g @fdslk/codegraph-viz`.

## Use

```bash
# Run inside a codegraph-indexed project. The browser opens automatically.
codegraph-viz

# See every indexed project on this machine.
codegraph-viz project ls
codegraph-viz project ls --json
codegraph-viz project ls --scan=~/somewhere --depth=5

# Open a specific project.
codegraph-viz open 2
codegraph-viz --project=~/projects/my-app
codegraph-viz --db=/abs/path/.codegraph/codegraph.db

# Keep the server running without opening a browser.
codegraph-viz --port=7700 --no-open
codegraph-viz --help
```

Browser opening is supported on macOS, Windows, and Linux. If the platform
opener is unavailable, the server continues running and prints its local URL.

## Contributing

```bash
git clone https://github.com/lkntfnd/codegraph-viz.git
cd codegraph-viz
npm ci
npm test
```

To inspect the frontend without indexing this repository, launch the deterministic
temporary graph fixture and open the URL it prints:

```bash
npm run dev:fixture
```

Run `npm run check` before opening a PR. It runs the test suite and inspects the
npm package with `npm pack --dry-run`.

D3 `7.9.0` is deliberately pinned as a **dev dependency** so tests can exercise
the force model and verify the committed browser bundle byte-for-byte. Published
users do not install D3: the browser loads `public/vendor/d3.v7.min.js`, which is
included in the package and works offline. Cytoscape and its CDN dependency have
been removed.

## Layout

```text
bin/cli.mjs            entry point and command router
src/commands/          serve, project-ls, and open commands
src/db.mjs             read-only SQLite driver + schema auto-detection
src/locate.mjs         find .codegraph upward / scan for indexed projects
src/views.mjs          graph loading + the three view aggregations
src/server.mjs         HTTP API + safe static frontend serving
src/open-browser.mjs   cross-platform browser launcher
public/index.html      native frontend shell
public/styles.css      Obsidian-style UI and theme tokens
public/app/            Canvas renderer, physics, interactions, settings, panel
public/vendor/         pinned D3 7.9.0 browser asset and license
scripts/               local development fixture
test/                  Node test suite and deterministic graph fixture
```

## If the graph is empty or wrong

Codegraph's exact table names are not part of its public API, so this tool
auto-detects them. If detection misses:

1. Open `http://localhost:7700/api/schema` (or run `codegraph-viz project ls --json`).
2. Set the correct table/column names in `CONFIG` at the top of `src/db.mjs`.
3. Restart.

Most common failure: edges reference node **ids** but are matched against the
wrong node column. Check that `edgeSource`/`edgeTarget` values line up with
`nodeId`.

## Add a subcommand

1. Copy `src/commands/_template.mjs` to `src/commands/mycommand.mjs` and edit it.
2. Import it in `src/commands/index.mjs` and add it to `COMMANDS`.

`bin/cli.mjs` routes by the command's `name` automatically.
