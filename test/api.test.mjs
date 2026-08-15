import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { getGraph, getMeta, getVersion, searchNodes } from '../public/app/api.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    async json() {
      if (options.jsonError) throw options.jsonError;
      return body;
    },
  };
}

test('API helpers request their exact endpoints and forward AbortSignals', async () => {
  const calls = [];
  const controller = new AbortController();
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return jsonResponse({ ok: true });
  };

  await getMeta({ signal: controller.signal });
  await getVersion({ signal: controller.signal });
  await searchNodes('a/b & c', { signal: controller.signal });

  assert.deepEqual(calls.map(([path]) => path), [
    '/api/meta',
    '/api/version',
    '/api/search?q=a%2Fb+%26+c',
  ]);
  assert.ok(calls.every(([, options]) => options.signal === controller.signal));
});

test('graph requests normalize view options and omit blank values', async () => {
  let requested;
  globalThis.fetch = async (path) => {
    requested = path;
    return jsonResponse({ nodes: [], edges: [] });
  };

  await getGraph({
    view: 'callgraph', focus: 'symbol:a/b', depth: 3, direction: 'callees',
    file: ' ', kind: null, recursive: false,
  });

  assert.equal(
    requested,
    '/api/graph?view=callgraph&focus=symbol%3Aa%2Fb&depth=3&direction=callees&recursive=false',
  );
});

test('API helpers preserve aborts and contextualize transport failures', async () => {
  const abort = new DOMException('stopped', 'AbortError');
  globalThis.fetch = async () => { throw abort; };
  await assert.rejects(getMeta(), (error) => error === abort);

  const failure = new Error('offline');
  globalThis.fetch = async () => { throw failure; };
  await assert.rejects(getVersion(), (error) => {
    assert.equal(error.message, 'Could not fetch /api/version: offline');
    assert.equal(error.cause, failure);
    return true;
  });
});

test('API helpers report HTTP and JSON failures with endpoint context', async () => {
  globalThis.fetch = async () => jsonResponse(null, {
    ok: false, status: 503, statusText: 'Unavailable',
  });
  await assert.rejects(searchNodes('x'), {
    message: 'Request for /api/search?q=x failed: HTTP 503 Unavailable',
  });

  const parseFailure = new SyntaxError('unexpected token');
  globalThis.fetch = async () => jsonResponse(null, { jsonError: parseFailure });
  await assert.rejects(getMeta(), (error) => {
    assert.equal(error.message, 'Invalid JSON from /api/meta: unexpected token');
    assert.equal(error.cause, parseFailure);
    return true;
  });
});
