import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createServer } from '../src/server.mjs';

let baseUrl;
let server;
let fixtureDir;

function rawRequest(pathname, options = {}) {
  const target = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: target.hostname,
      port: target.port,
      path: pathname,
      method: options.method || 'GET',
      headers: options.headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

before(async () => {
  fixtureDir = await mkdtemp(join(tmpdir(), 'codegraph-viz-test-'));
  const dbPath = join(fixtureDir, 'codegraph.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE nodes (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      file TEXT
    );
    CREATE TABLE edges (
      source INTEGER NOT NULL,
      target INTEGER NOT NULL,
      kind TEXT NOT NULL
    );
    INSERT INTO nodes (id, name, kind, file) VALUES
      (1, 'main', 'function', 'src/main.mjs'),
      (2, 'helper', 'function', 'src/helper.mjs'),
      (3, 'persist', 'function', 'src/persist.mjs'),
      (4, 'write', 'function', 'src/write.mjs');
    INSERT INTO edges (source, target, kind) VALUES
      (1, 2, 'calls'),
      (1, 2, 'calls'),
      (1, 2, 'imports'),
      (2, 3, 'calls'),
      (3, 4, 'calls');
  `);
  db.close();

  ({ server } = await createServer(dbPath));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(fixtureDir, { recursive: true, force: true });
});

test('serves the browser application through the public root', async () => {
  const response = await fetch(`${baseUrl}/`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html\b/);
  assert.match(await response.text(), /codegraph-viz/);
});

test('exposes the entity browser as a keyboard-addressable combobox and listbox', async () => {
  const response = await fetch(`${baseUrl}/`);
  const shell = await response.text();

  assert.match(shell, /id="entity-query"[^>]*role="combobox"/);
  assert.match(shell, /id="entity-query"[^>]*aria-controls="entities-list"/);
  assert.match(shell, /id="entity-query"[^>]*aria-autocomplete="list"/);
  assert.match(shell, /id="entities-list"[^>]*role="listbox"/);
});

test('connects view tabs to a named interactive graph surface', async () => {
  const response = await fetch(`${baseUrl}/`);
  const shell = await response.text();

  assert.match(shell, /role="tab"[^>]*aria-controls="workspace"/);
  assert.match(shell, /id="graph"[^>]*role="application"/);
  assert.match(shell, /id="graph"[^>]*aria-roledescription="interactive code graph"/);
});

test('does not serve the browser application for non-reading methods', async () => {
  const response = await fetch(`${baseUrl}/`, { method: 'POST' });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not found' });
});

test('reports graph metadata through the public API', async () => {
  const response = await fetch(`${baseUrl}/api/meta`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.nodeCount, 4);
  assert.equal(body.edgeCount, 5);
});

test('rejects non-loopback Host headers before serving project data', async () => {
  const response = await rawRequest('/api/meta', { headers: { Host: 'attacker.example' } });

  assert.equal(response.status, 421);
  assert.deepEqual(JSON.parse(response.body), { error: 'invalid host' });
  assert.doesNotMatch(response.body, /codegraph\.db/);
});

test('rejects non-loopback browser origins before serving project data', async () => {
  const response = await rawRequest('/api/meta', {
    headers: { Origin: 'https://attacker.example' },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(JSON.parse(response.body), { error: 'invalid origin' });
  assert.doesNotMatch(response.body, /codegraph\.db/);
});

test('preserves a per-kind breakdown on aggregated file dependencies', async () => {
  const response = await fetch(`${baseUrl}/api/graph?view=filedeps`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.edges, [
    {
      source: 'src/main.mjs',
      target: 'src/helper.mjs',
      weight: 3,
      relations: [
        { kind: 'calls', weight: 2 },
        { kind: 'imports', weight: 1 },
      ],
    },
    {
      source: 'src/helper.mjs',
      target: 'src/persist.mjs',
      weight: 1,
      relations: [{ kind: 'calls', weight: 1 }],
    },
    {
      source: 'src/persist.mjs',
      target: 'src/write.mjs',
      weight: 1,
      relations: [{ kind: 'calls', weight: 1 }],
    },
  ]);
});

test('limits focused Call graph expansion by depth', async () => {
  const shallow = await fetch(`${baseUrl}/api/graph?view=callgraph&focus=2&depth=1`).then((response) => response.json());
  const deep = await fetch(`${baseUrl}/api/graph?view=callgraph&focus=2&depth=2`).then((response) => response.json());

  assert.deepEqual(shallow.nodes.map((node) => String(node.id)).sort(), ['1', '2', '3']);
  assert.deepEqual(deep.nodes.map((node) => String(node.id)).sort(), ['1', '2', '3', '4']);
});

test('clamps Call graph depth at the API boundary', async () => {
  const belowRange = await fetch(`${baseUrl}/api/graph?view=callgraph&focus=2&depth=-8`).then((response) => response.json());
  const aboveRange = await fetch(`${baseUrl}/api/graph?view=callgraph&focus=2&depth=99`).then((response) => response.json());

  assert.deepEqual(belowRange.nodes.map((node) => String(node.id)).sort(), ['1', '2', '3']);
  assert.deepEqual(aboveRange.nodes.map((node) => String(node.id)).sort(), ['1', '2', '3', '4']);
});

test('filters focused Call graph traversal by caller or callee direction', async () => {
  const callers = await fetch(`${baseUrl}/api/graph?view=callgraph&focus=2&depth=2&direction=callers`).then((response) => response.json());
  const callees = await fetch(`${baseUrl}/api/graph?view=callgraph&focus=2&depth=2&direction=callees`).then((response) => response.json());

  assert.deepEqual(callers.nodes.map((node) => String(node.id)).sort(), ['1', '2']);
  assert.deepEqual(callees.nodes.map((node) => String(node.id)).sort(), ['2', '3', '4']);
});

test('returns the documented architecture graph shape', async () => {
  const response = await fetch(`${baseUrl}/api/graph?view=architecture`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.view, 'architecture');
  assert.ok(Array.isArray(body.nodes));
  assert.ok(Array.isArray(body.edges));
});

test('returns a recursive containment hierarchy for Structure tree', async () => {
  const response = await fetch(`${baseUrl}/api/graph?view=architecture&recursive=1`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.view, 'architecture');
  assert.equal(body.recursive, true);
  assert.equal(body.relation, 'containment');
  assert.deepEqual(body.nodes.map(({ id, parent, kind }) => ({ id, parent, kind })), [
    { id: '.', parent: null, kind: 'folder' },
    { id: 'src', parent: '.', kind: 'folder' },
    { id: 'src/helper.mjs', parent: 'src', kind: 'file' },
    { id: 'src/main.mjs', parent: 'src', kind: 'file' },
    { id: 'src/persist.mjs', parent: 'src', kind: 'file' },
    { id: 'src/write.mjs', parent: 'src', kind: 'file' },
  ]);
  assert.deepEqual(body.edges, [
    { source: '.', target: 'src', kind: 'contains', weight: 1 },
    { source: 'src', target: 'src/helper.mjs', kind: 'contains', weight: 1 },
    { source: 'src', target: 'src/main.mjs', kind: 'contains', weight: 1 },
    { source: 'src', target: 'src/persist.mjs', kind: 'contains', weight: 1 },
    { source: 'src', target: 'src/write.mjs', kind: 'contains', weight: 1 },
  ]);
});

test('returns JSON 404s for unknown API routes', async () => {
  const response = await fetch(`${baseUrl}/api/nope`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not found' });
});

test('serves local styles with a browser-safe content type', async () => {
  const response = await fetch(`${baseUrl}/styles.css`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/css\b/);
  assert.ok((await response.text()).length > 0);
});

test('serves the vendored graph engine without a network dependency', async () => {
  const response = await fetch(`${baseUrl}/vendor/d3.v7.min.js`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(await response.text(), /d3/);
});

test('serves native browser modules and references no remote executable assets', async () => {
  const [shellResponse, moduleResponse] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/app/main.js`),
  ]);
  const shell = await shellResponse.text();

  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get('content-type'), /javascript/);
  assert.doesNotMatch(shell, /<(?:script|link)\b[^>]*(?:src|href)=["']https?:\/\//i);
  assert.doesNotMatch(shell, /cytoscape/i);
});

test('does not expose files outside the public directory', async () => {
  for (const pathname of [
    '/../src/server.mjs',
    '/%2e%2e/src/server.mjs',
    '/vendor/../../src/db.mjs',
    '/vendor/%2e%2e/%2e%2e/src/db.mjs',
  ]) {
    const response = await rawRequest(pathname);
    assert.ok([400, 404].includes(response.status), `${pathname} returned ${response.status}`);
    assert.doesNotMatch(response.body, /Create \(but don't start\) the server/);
    assert.doesNotMatch(response.body, /Open a db read-only/);
  }
});

test('returns 404 for a missing static module', async () => {
  const response = await fetch(`${baseUrl}/app/does-not-exist.js`);

  assert.equal(response.status, 404);
});
