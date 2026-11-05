import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { launchForRun, parseActivityLaunches } from '../app/src/activity-launches.ts';

test('activity requests are restored honestly and correlated only by exact identifier', () => {
  const first = { id: 'a'.repeat(32), activity: 'review', label: 'Review', at: '2026-01-01', phase: 'sending' };
  const second = { ...first, id: 'b'.repeat(32), label: 'Another review', phase: 'sent' };
  const items = parseActivityLaunches(JSON.stringify([first, second, { ...first, id: '../bad' }]));
  assert.equal(items.length, 2);
  assert.equal(items[0].phase, 'unconfirmed');
  assert.equal(items[1].phase, 'sent');
  assert.equal(launchForRun(`20260101-1200-review-moki-${second.id}`, items)?.label, second.label);
  assert.equal(launchForRun('20260101-1200-review', items), undefined);
  assert.equal(launchForRun(`20260101-1200-review-moki-${first.id}-extra`, items), undefined);
  assert.deepEqual(parseActivityLaunches('bad json'), []);
});
