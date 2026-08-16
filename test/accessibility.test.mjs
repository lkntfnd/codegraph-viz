import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  graphReadyAnnouncement,
  selectionClearedAnnouncement,
} from '../public/app/accessibility.js';

test('formats concise graph-ready announcements from visible evidence', () => {
  assert.equal(
    graphReadyAnnouncement('Radial reach layout', '3 of 400 nodes · 4 visible links'),
    'Radial reach layout ready. 3 of 400 nodes · 4 visible links.',
  );
  assert.equal(
    graphReadyAnnouncement('Call graph', '1 node'),
    'Call graph ready. 1 node.',
  );
});

test('describes the focus destination when selection is cleared', () => {
  assert.equal(
    selectionClearedAnnouncement(),
    'Selection cleared. Focus returned to graph.',
  );
});
