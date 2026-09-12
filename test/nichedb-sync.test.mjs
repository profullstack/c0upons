// The nichedb sync is the only thing that puts rows into an empty c0upons, so
// this runs it end to end: the real migration against a local libSQL file (the
// driver production uses), a fake nichedb answering two pages, and then the
// same fake again to prove a second run changes nothing. The module under test
// is TypeScript; Node 22+ strips the types itself, which is why the file has no
// framework imports and no path aliases.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createClient } = await import(require.resolve('@libsql/client'));
const { syncNichedbDeals, toCouponRow, displayName, dateOnly } = await import(
  '../apps/web/lib/nichedb-sync.ts'
);

const dir = mkdtempSync(join(tmpdir(), 'c0upons-sync-'));
const url = `file:${join(dir, 'local.db')}`;
let client;
const db = {
  sql: async (strings, ...values) => {
    const rs = await client.execute({
      sql: strings.join('?'),
      args: values.map((v) => (v === undefined ? null : v)),
    });
    return rs.rows;
  },
};

/* Items as nichedb.dev's /api/v1/items returns them for the deals collection. */
const item = (id, over = {}) => ({
  id,
  collection: 'deals',
  source: 'slickdeals-frontpage',
  adapter: 'slickdeals',
  kind: 'coupon',
  external_id: `thread-${id}`,
  title: `Deal ${id}: 20% off headphones`,
  summary: 'Use it at checkout.',
  url: `https://slickdeals.net/f/${id}`,
  image_url: null,
  published_at: '2026-09-12T18:22:14.000Z',
  tags: ['slickdeals', 'amazon', 'coupon-code'],
  data: {
    store: 'amazon',
    storeKey: 'amazon',
    storeDomain: 'amazon.com',
    code: `CODE${id}`,
    discountType: 'percent',
    discountValue: 20,
    price: 79.99,
    expires: null,
  },
  ...over,
});

/** A nichedb that has `all` items and pages them the way the real API does. */
function fakeNichedb(all) {
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(u);
    const q = new URL(u).searchParams;
    const after = Number(q.get('after')) || 0;
    const limit = Number(q.get('limit'));
    const items = all.filter((i) => i.id > after).slice(0, limit);
    return { ok: true, status: 200, json: async () => ({ count: items.length, items }) };
  };
  return { fetchImpl, calls };
}

before(() => {
  execFileSync('node', ['apps/web/scripts/migrate.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  client = createClient({ url });
});

after(() => {
  client?.close();
  rmSync(dir, { recursive: true, force: true });
});

test('a key becomes a name a page can show', () => {
  assert.equal(displayName('amazon', 'amazon'), 'Amazon');
  assert.equal(displayName('best buy', 'best-buy'), 'Best Buy');
  assert.equal(displayName('Woot! An Amazon Company', 'woot-an-amazon-company'), 'Woot! An Amazon Company');
  assert.equal(dateOnly('2026-09-18T00:00:00-04:00'), '2026-09-18');
  assert.equal(dateOnly(null), null);
});

test('an item maps to a coupon with its store, or to nothing', () => {
  const row = toCouponRow(item(1));
  assert.equal(row.source_id, 'slickdeals-frontpage:thread-1');
  assert.equal(row.code, 'CODE1');
  assert.equal(row.discount, '20%');
  assert.deepEqual(row.store, {
    name: 'Amazon',
    slug: 'amazon',
    website: 'https://amazon.com',
    logo_url: 'https://www.google.com/s2/favicons?domain=amazon.com&sz=128',
  });

  // A deal without a code is still a row: the store page wants the price.
  const deal = toCouponRow(item(2, { kind: 'deal', data: { ...item(2).data, code: null } }));
  assert.equal(deal.code, null);
  assert.equal(deal.discount, '20%');

  // No store, no page to put it on.
  assert.equal(toCouponRow(item(3, { data: { ...item(3).data, store: null, storeKey: null } })), null);
  // A Reddit post is conversation unless it carries a code.
  assert.equal(toCouponRow(item(4, { kind: 'post', data: { ...item(4).data, code: null } })), null);
  assert.ok(toCouponRow(item(5, { kind: 'post' })));
});

test('a cold run pages through nichedb, writes stores and coupons, and a second run is idempotent', async () => {
  const all = [
    ...Array.from({ length: 200 }, (_, i) => item(i + 1)),
    item(201, { data: { ...item(201).data, store: 'Best Buy', storeKey: 'best-buy', storeDomain: null } }),
    item(202, { kind: 'post', data: { ...item(202).data, code: null } }),
  ];
  const nichedb = fakeNichedb(all);

  const first = await syncNichedbDeals(db, { fetch: nichedb.fetchImpl, baseUrl: 'https://nichedb.test' });
  assert.equal(first.skipped, false);
  assert.equal(first.fetched, 202);
  assert.equal(first.upserted, 201, 'the code-less post is declined');
  assert.equal(first.stores, 2);
  assert.equal(first.cursor, 202);
  assert.equal(first.more, false);
  assert.equal(nichedb.calls.length, 2, 'two pages: a full one and a short one');
  assert.match(nichedb.calls[0], /^https:\/\/nichedb\.test\/api\/v1\/items\?collection=deals&sort=id&order=asc&limit=200&after=0$/);
  assert.match(nichedb.calls[1], /after=200$/);

  const stores = await db.sql`SELECT name, slug, website FROM stores ORDER BY slug`;
  assert.deepEqual(
    stores.map((s) => [s.name, s.slug, s.website]),
    [
      ['Amazon', 'amazon', 'https://amazon.com'],
      ['Best Buy', 'best-buy', null],
    ]
  );
  const [{ n }] = await db.sql`SELECT COUNT(*) AS n FROM coupons`;
  assert.equal(Number(n), 201);
  const [row] = await db.sql`SELECT code, discount, source, source_id, created_at FROM coupons WHERE source_id = 'slickdeals-frontpage:thread-7'`;
  assert.equal(row.code, 'CODE7');
  assert.equal(row.discount, '20%');
  assert.equal(row.source, 'nichedb');
  assert.equal(row.created_at, '2026-09-12T18:22:14.000Z');

  // Ten minutes have not passed: nothing is fetched.
  const throttled = await syncNichedbDeals(db, { fetch: nichedb.fetchImpl, baseUrl: 'https://nichedb.test' });
  assert.equal(throttled.skipped, true);
  assert.equal(nichedb.calls.length, 2);

  // Later, with the upstream unchanged: one short request past the cursor, no new rows.
  const later = () => new Date(Date.now() + 11 * 60_000);
  const second = await syncNichedbDeals(db, { fetch: nichedb.fetchImpl, baseUrl: 'https://nichedb.test', now: later });
  assert.equal(second.skipped, false);
  assert.equal(second.fetched, 0);
  assert.match(nichedb.calls[2], /after=202$/);
  const [{ n: n2 }] = await db.sql`SELECT COUNT(*) AS n FROM coupons`;
  assert.equal(Number(n2), 201);

  // An edited upstream row updates in place rather than duplicating.
  const edited = [item(7, { title: 'Deal 7: now 30% off', data: { ...item(7).data, discountValue: 30 } })];
  const changed = fakeNichedb(edited);
  await db.sql`UPDATE sync_state SET value = '6' WHERE key = 'nichedb:deals:after'`;
  const third = await syncNichedbDeals(db, { fetch: changed.fetchImpl, baseUrl: 'https://nichedb.test', now: () => new Date(Date.now() + 30 * 60_000) });
  assert.equal(third.upserted, 1);
  const [{ n: n3 }] = await db.sql`SELECT COUNT(*) AS n FROM coupons`;
  assert.equal(Number(n3), 201);
  const [seven] = await db.sql`SELECT title, discount FROM coupons WHERE source_id = 'slickdeals-frontpage:thread-7'`;
  assert.equal(seven.title, 'Deal 7: now 30% off');
  assert.equal(seven.discount, '30%');
});
