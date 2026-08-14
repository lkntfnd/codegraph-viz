import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

test('the vendored browser bundle exactly matches the pinned d3 dev dependency', async () => {
  const d3Entry = fileURLToPath(import.meta.resolve('d3'));
  const installedBundle = resolve(dirname(d3Entry), '..', 'dist', 'd3.min.js');
  const vendoredBundle = join(import.meta.dirname, '..', 'public', 'vendor', 'd3.v7.min.js');
  const [installed, vendored] = await Promise.all([
    readFile(installedBundle),
    readFile(vendoredBundle),
  ]);

  assert.equal(Buffer.compare(vendored, installed), 0);
  assert.match(vendored.toString('utf8', 0, 100), /v7\.9\.0/);
});
