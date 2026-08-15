import test from 'node:test';
import assert from 'node:assert/strict';

import { territorySizeEvidence } from '../public/app/territoryEvidence.js';

test('territory size evidence names exact indexed-symbol area', () => {
  assert.deepEqual(territorySizeEvidence({ size: 12 }), {
    count: 12,
    label: '12 indexed symbols',
  });
  assert.deepEqual(territorySizeEvidence({ size: 1 }), {
    count: 1,
    label: '1 indexed symbol',
  });
  assert.equal(territorySizeEvidence({ size: 'unknown' }), null);
  assert.equal(territorySizeEvidence(null), null);
});
