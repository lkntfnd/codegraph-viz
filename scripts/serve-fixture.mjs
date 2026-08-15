// scripts/serve-fixture.mjs — serve a disposable graph for browser development.

import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { createServer } from '../src/server.mjs';

const HOST = '127.0.0.1';
const TEMP_PREFIX = 'codegraph-viz-browser-fixture-';

const files = [
  [1, 'src/app.mjs'],
  [2, 'src/controllers/session-controller.mjs'],
  [3, 'src/services/auth-service.mjs'],
  [4, 'src/models/user.mjs'],
  [5, 'src/ui/profile-card.mjs'],
  [6, 'test/auth-service.test.mjs'],
  [7, 'scripts/disconnected-worker.mjs'],
  [8, 'src/security/hostile-labels.mjs'],
];

const nodes = [
  [1, 'app', 'module', 1],
  [2, 'bootstrap', 'function', 1],
  [3, 'session-controller', 'module', 2],
  [4, 'SessionController', 'class', 2],
  [5, 'SessionController.login', 'method', 2],
  [6, 'auth-service', 'module', 3],
  [7, 'AuthService', 'class', 3],
  [8, 'AuthService.authenticate', 'method', 3],
  [9, 'hashPassword', 'function', 3],
  [10, 'user', 'module', 4],
  [11, 'User', 'class', 4],
  [12, 'User.fromRow', 'method', 4],
  [13, 'profile-card', 'module', 5],
  [14, 'ProfileCard', 'class', 5],
  [15, 'ProfileCard.render', 'method', 5],
  [16, 'auth-service.test', 'module', 6],
  [17, 'signs in a valid user', 'function', 6],
  [18, 'disconnected-worker', 'module', 7],
  [19, 'detachedCleanup (intentionally disconnected)', 'function', 7],
  [20, 'hostile-labels', 'module', 8],
  [21, '</script><script>globalThis.__fixtureXss = true</script>', 'class', 8],
  [22, '<img src=x onerror="globalThis.__fixtureXss = true"> & "quotes"', 'function', 8],
];

const edges = [
  // Cross-folder dependencies make the architecture and file-dependency views useful.
  [1, 3, 'imports'],
  [3, 6, 'imports'],
  [6, 10, 'imports'],
  [13, 10, 'imports'],
  [16, 6, 'imports'],
  [20, 13, 'imports'],

  // Calls include methods, constructors/classes, branching, and hostile text.
  [2, 4, 'calls constructor'],
  [2, 5, 'calls'],
  [5, 8, 'calls'],
  [8, 9, 'calls'],
  [8, 12, 'calls'],
  [12, 11, 'calls constructor'],
  [15, 12, 'calls'],
  [17, 8, 'calls'],
  [22, 14, 'calls constructor'],
  [22, 15, 'calls'],

  // Membership edges add realistic graph metadata without affecting call physics.
  [4, 5, 'member'],
  [7, 8, 'member'],
  [7, 9, 'member'],
  [11, 12, 'member'],
  [14, 15, 'member'],
  [21, 22, 'member'],
];

let tempRoot;
let fixtureDir;
let server;
let cleanupPromise;
let startupFinished;
let finishStartup;
let receivedSignal;

startupFinished = new Promise((resolveStartup) => {
  finishStartup = resolveStartup;
});

function verifiedFixtureDirectory(candidate) {
  if (!candidate || !tempRoot) {
    throw new Error('Refusing cleanup without a known fixture and temp root');
  }

  const absolute = resolve(candidate);
  if (dirname(absolute) !== tempRoot || !basename(absolute).startsWith(TEMP_PREFIX)) {
    throw new Error(`Refusing to remove unverified fixture directory: ${absolute}`);
  }
  return absolute;
}

function createFixtureDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE
      );
      CREATE TABLE nodes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        file_id INTEGER REFERENCES files(id)
      );
      CREATE TABLE edges (
        source INTEGER NOT NULL REFERENCES nodes(id),
        target INTEGER NOT NULL REFERENCES nodes(id),
        kind TEXT NOT NULL
      );
    `);

    const insertFile = db.prepare('INSERT INTO files (id, path) VALUES (?, ?)');
    const insertNode = db.prepare('INSERT INTO nodes (id, name, kind, file_id) VALUES (?, ?, ?, ?)');
    const insertEdge = db.prepare('INSERT INTO edges (source, target, kind) VALUES (?, ?, ?)');

    db.exec('BEGIN');
    for (const row of files) insertFile.run(...row);
    for (const row of nodes) insertNode.run(...row);
    for (const row of edges) insertEdge.run(...row);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  } finally {
    db.close();
  }
}

function closeServer() {
  if (!server) return Promise.resolve();
  if (!server.listening) {
    // createServer owns the read-only database and releases it on this event.
    server.emit('close');
    server = undefined;
    return Promise.resolve();
  }

  const currentServer = server;
  server = undefined;
  return new Promise((resolveClose, rejectClose) => {
    currentServer.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    await closeServer();
    if (!fixtureDir) return;
    const disposableDir = verifiedFixtureDirectory(fixtureDir);
    await rm(disposableDir, { recursive: true, force: true });
    fixtureDir = undefined;
  })();
  return cleanupPromise;
}

function handleSignal(signal) {
  if (receivedSignal) return;
  receivedSignal = signal;
  void (async () => {
    await startupFinished;
    try {
      await cleanup();
      process.exitCode = signal === 'SIGINT' ? 130 : 143;
    } catch (error) {
      console.error(`Fixture cleanup failed: ${error.message}`);
      process.exitCode = 1;
    }
  })();
}

process.once('SIGINT', () => handleSignal('SIGINT'));
process.once('SIGTERM', () => handleSignal('SIGTERM'));

async function start() {
  try {
    tempRoot = await realpath(tmpdir());
    if (receivedSignal) return;

    fixtureDir = await mkdtemp(join(tempRoot, TEMP_PREFIX));
    verifiedFixtureDirectory(fixtureDir);
    if (receivedSignal) return;

    const dbPath = join(fixtureDir, 'browser-fixture.sqlite');
    createFixtureDatabase(dbPath);
    if (receivedSignal) return;

    ({ server } = await createServer(dbPath));
    await new Promise((resolveListen, rejectListen) => {
      const onError = (error) => {
        server.off('listening', onListening);
        rejectListen(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolveListen();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(0, HOST);
    });

    if (receivedSignal) return;
    const address = server.address();
    console.log(`http://${HOST}:${address.port}/`);
  } finally {
    finishStartup();
  }
}

try {
  await start();
} catch (error) {
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error(`Fixture cleanup failed: ${cleanupError.message}`);
  }
  console.error(`Fixture server failed: ${error.message}`);
  process.exitCode = 1;
}
