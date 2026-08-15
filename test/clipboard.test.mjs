import test from 'node:test';
import assert from 'node:assert/strict';

import { copyText } from '../public/app/clipboard.js';

test('copyText normalizes values and uses the injected clipboard', async () => {
  const writes = [];
  const copied = await copyText(42, { writeText: async (value) => writes.push(value) });
  assert.equal(copied, '42');
  assert.deepEqual(writes, ['42']);
});

test('copyText preserves paths and propagates clipboard failures', async () => {
  await assert.rejects(
    copyText('src/app.mjs', { writeText: async () => { throw new Error('denied'); } }),
    /denied/,
  );
  await assert.rejects(copyText('name', null), /Clipboard is unavailable/);
});
