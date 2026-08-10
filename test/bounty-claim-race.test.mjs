import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../apps/web/app/api/bounties/[id]/claim/route.ts', import.meta.url),
  'utf8'
);

test('a funded bounty is reserved atomically before payout', () => {
  assert.match(
    source,
    /UPDATE bounties[\s\S]*WHERE id = \$\{bountyId\} AND status = 'funded'[\s\S]*RETURNING id/
  );
  assert.match(source, /if \(!claimed\.length\)/);
  assert.doesNotMatch(source, /SELECT claimer_did FROM bounties/);

  const reservation = source.indexOf('const claimed = await db.sql');
  const payout = source.indexOf('prepare-tx');
  assert.ok(reservation >= 0 && reservation < payout, 'reservation must happen before payout');
});
