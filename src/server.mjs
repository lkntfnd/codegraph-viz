// src/server.mjs — HTTP server bound to one project's db.

import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { openDb, detectSchema } from './db.mjs';
import { dbMtime } from './util.mjs';
import { loadGraph, viewArchitecture, viewFileDeps, viewCallGraph, searchNodes } from './views.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const PUBLIC_ROOT = resolve(PUBLIC);

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
]);

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function insidePublic(filePath) {
  const rel = relative(PUBLIC_ROOT, filePath);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function publicFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { error: 400 };
  }
  if (decoded.includes('\0')) return { error: 400 };

  const candidate = resolve(PUBLIC, `.${decoded}`);
  if (!insidePublic(candidate)) return { error: 404 };

  try {
    const info = await stat(candidate);
    if (!info.isFile()) return { error: 404 };

    // A file symlinked from public must not become an escape hatch.
    const actual = await realpath(candidate);
    if (!insidePublic(actual)) return { error: 404 };
    return { path: actual, type: CONTENT_TYPES.get(extname(actual).toLowerCase()) || 'application/octet-stream' };
  } catch {
    return { error: 404 };
  }
}

/** Create (but don't start) the server for a given db path. */
export async function createServer(dbPath) {
  const db = await openDb(dbPath);
  const schema = detectSchema(db);
  let cache = null; // { mtime, graph }

  async function graph() {
    const mtime = await dbMtime(dbPath);
    if (cache && cache.mtime === mtime) return cache.graph;
    const g = loadGraph(db, schema);
    cache = { mtime, graph: g };
    return g;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;

      if (p === '/api/version') return send(res, 200, { mtime: await dbMtime(dbPath) });
      if (p === '/api/schema') return send(res, 200, { detected: schema, dbPath, driver: db.driver });

      if (p === '/api/meta') {
        const g = await graph();
        if (g.error) return send(res, 200, { error: g.error, schema, dbPath, driver: db.driver });
        return send(res, 200, {
          dbPath, driver: db.driver, mtime: await dbMtime(dbPath),
          nodeCount: g.nodes.size, edgeCount: g.edges.length,
          nodeKinds: g.nodeKinds, edgeKinds: g.edgeKinds,
          nodesTable: schema.nodesTable, edgesTable: schema.edgesTable, filesTable: schema.filesTable,
        });
      }
      if (p === '/api/search') {
        const g = await graph();
        if (g.error) return send(res, 200, { results: [] });
        return send(res, 200, { results: searchNodes(g, url.searchParams.get('q') || '') });
      }
      if (p === '/api/graph') {
        const g = await graph();
        if (g.error) return send(res, 200, { error: g.error });
        const view = url.searchParams.get('view') || 'architecture';
        const opt = {
          limit: Number(url.searchParams.get('limit')) || undefined,
          depth: Number(url.searchParams.get('depth')) || 2,
          focus: url.searchParams.get('focus') || null,
          kind: url.searchParams.get('kind') || null,
          prefix: url.searchParams.get('prefix') || '',
          file: url.searchParams.get('file') || null,
        };
        const data = view === 'callgraph' ? viewCallGraph(g, opt)
          : view === 'filedeps' ? viewFileDeps(g, opt)
          : viewArchitecture(g, opt);
        data.mtime = await dbMtime(dbPath);
        return send(res, 200, data);
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const file = await publicFile(p === '/' ? '/index.html' : p);
        if (file.path) {
          const body = req.method === 'HEAD' ? '' : await readFile(file.path);
          return send(res, 200, body, file.type);
        }
        if (file.error === 400) return send(res, 400, { error: 'bad request' });
      }
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      return send(res, 500, { error: String(err?.message || err) });
    }
  });

  server.on('close', () => { try { db.close(); } catch {} });
  return { server, schema, driver: db.driver };
}
