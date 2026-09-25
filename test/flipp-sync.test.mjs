// Grocery weekly ads are the third thing that puts rows into c0upons, and the
// first whose rows expire on a schedule, so this runs it end to end: the real
// migration against a local libSQL file, a fake Flipp answering with the
// shapes it returned for Sacramento on 2026-09-25 (Raley's 8141217), a second
// run proving the queue carries on where the first stopped, and a run a week
// later proving last week's prices are removed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
// Production is Postgres through libsql-pg; C0UPONS_TEST_DATABASE_URL=postgres://... runs this there too.
const pgUrl = process.env.C0UPONS_TEST_DATABASE_URL;
const { createClient } = await import(require.resolve(pgUrl ? '@profullstack/libsql-pg' : '@libsql/client'));
const { syncFlippWeeklyAds, toCouponRow, priceLabel, storeSlug, flyerStore, readOrder } = await import('../apps/web/lib/flipp-sync.ts');
const { sweepReveals } = await import('../apps/web/lib/reveal-coupon.ts');

const dir = mkdtempSync(join(tmpdir(), 'c0upons-flipp-'));
const url = pgUrl ?? `file:${join(dir, 'local.db')}`;
let client;
const db = {
  sql: async (strings, ...values) => {
    const rs = await client.execute({ sql: strings.join('?'), args: values.map((v) => (v === undefined ? null : v)) });
    return rs.rows;
  },
};

const API = 'https://flipp.test/flipp';
const WEEK = { valid_from: '2026-09-23T00:00:00-04:00', valid_to: '2026-09-29T23:59:59-04:00' };

const flyer = (id, merchant, merchant_id, name, categories, extra = {}) => ({
  id, merchant, merchant_id, name, categories_csv: `All Flyers,${categories}`,
  merchant_logo: `http://images.wishabi.net/merchants/${merchant_id}/large`, ...WEEK, ...extra,
});

// Sacramento lists Raley's, Walmart, a pharmacy and an electronics flyer; New
// York lists Walmart again (same chain, same flyer name) and a Wegmans.
const FLYERS = {
  '95814': [
    flyer(8141217, "Raley's", 2044, 'Weekly Flyer', 'Groceries'),
    flyer(8157039, 'Walmart', 2175, 'Flyer', 'Groceries,General Merchandise'),
    flyer(8150000, 'CVS Pharmacy', 2230, 'Weekly Ad', 'Pharmacy'),
    flyer(8150001, 'Best Buy', 2140, 'Weekly Ad', 'Electronics'),
    flyer(8100000, 'Safeway', 5667, 'Last Week', 'Groceries', { valid_to: '2026-09-22T23:59:59-04:00' }),
  ],
  '10001': [
    flyer(8157999, 'Walmart', 2175, 'Flyer', 'Groceries,General Merchandise'),
    flyer(8160000, 'Wegmans', 2600, 'Weekly Ad', 'Groceries'),
  ],
};

const item = (id, name, price, extra = {}) => ({
  id, flyer_id: 0, name, price, cutout_image_url: `http://f.wishabi.net/page_items/${id}/extra_large.jpg`, ...WEEK, ...extra,
});

const ITEMS = {
  8141217: [
    item(1041311431, 'Foster Farms Fresh Whole Fryer Chicken', '0.97'),
    item(1041311419, 'Propel Beverage or Gatorade', '0.99'),
    item(1041311400, "Raley's Large Cage Free Eggs", '1.99'),
    item(1041311401, 'See store for details', null),
  ],
  8157039: [item(2000000001, 'Great Value Milk', '3.12')],
  8150000: [item(3000000001, 'CVS Health Vitamin D3', '5.00')],
  8160000: [item(4000000001, 'Wegmans Bananas', '0.59')],
};

// Search knows the unit and the fine print for two of Raley's items, and has
// a Bel Air item on another flyer that must not leak in.
const SEARCH = {
  "Raley's": [
    { flyer_item_id: 1041311431, flyer_id: 8141217, post_price_text: 'lb', sale_story: 'MEMBER PRICE' },
    { flyer_item_id: 1041311419, flyer_id: 8141217, pre_price_text: 'BUY 4 OR MORE', post_price_text: '+CRV CA only Single Item $2.00 ea', original_price: '2.00' },
    { flyer_item_id: 9999, flyer_id: 8142545, post_price_text: 'lb' },
  ],
};

function fakeFlipp() {
  const calls = [];
  const fetchImpl = async (u) => {
    calls.push(u);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    const parsed = new URL(u);
    if (parsed.pathname === '/flipp/flyers') return json({ flyers: FLYERS[parsed.searchParams.get('postal_code')] ?? [] });
    const m = /^\/flipp\/flyers\/(\d+)$/.exec(parsed.pathname);
    if (m) return json({ items: ITEMS[m[1]] ?? [] });
    if (parsed.pathname === '/flipp/items/search') return json({ items: SEARCH[parsed.searchParams.get('q')] ?? [] });
    throw new Error(`unexpected fetch ${u}`);
  };
  return { fetchImpl, calls };
}

const opts = (fetchImpl, now) => ({
  apiUrl: API, postalCodes: ['95814', '10001'], maxFlyers: 2, minMinutesBetweenRuns: 0, fetch: fetchImpl, now: () => new Date(now),
});

before(() => {
  execFileSync('node', ['apps/web/scripts/migrate.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: url, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  client = createClient({ url });
});

after(() => {
  client?.close();
  rmSync(dir, { recursive: true, force: true });
});

test('store slugs match the ones the site already has', () => {
  assert.equal(storeSlug("Raley's"), 'raleys');
  assert.equal(storeSlug('Smart & Final'), 'smart-and-final');
  assert.equal(storeSlug('Walmart'), 'walmart');
  assert.equal(storeSlug('Dollar General'), 'dollar-general');
  const s = flyerStore({ merchant: "Raley's", logo: 'http://images.wishabi.net/merchants/2044/large' });
  assert.equal(s.website, 'https://raleys.com');
  assert.equal(s.logo_url, 'https://images.wishabi.net/merchants/2044/large', 'the logo is served over https');
});

test('the badge carries the unit and the fine print goes to the description', () => {
  assert.deepEqual(priceLabel(0.97, 'lb'), { label: '$0.97/lb', rest: null });
  assert.deepEqual(priceLabel(1.99, 'ea +CRV CA only'), { label: '$1.99 ea', rest: '+CRV CA only' });
  assert.deepEqual(priceLabel(17.99, null), { label: '$17.99', rest: null });
  assert.deepEqual(priceLabel(2.28, 'ea. Single Item $2.78 ea'), { label: '$2.28 ea', rest: 'Single Item $2.78 ea' });

  // Target writes "2 for $10" as pre_price_text "2/" and price 10.00.
  const target = { id: 8123225, merchant: 'Target', merchant_id: 2040, logo: null, postal_code: '95814', valid_to: WEEK.valid_to };
  const twoFor = toCouponRow(item(5, 'Bertolli frozen meals', '12.00'), target, { pre_price_text: '2/', sale_story: 'Save when you buy 2' });
  assert.equal(twoFor.discount, '2 for $12.00');
  assert.match(twoFor.description, /^Save when you buy 2\. Target weekly ad price/, 'the "2/" is in the badge, not the description');

  const f = { id: 8141217, merchant: "Raley's", merchant_id: 2044, logo: null, postal_code: '95814', valid_to: WEEK.valid_to };
  const row = toCouponRow(ITEMS[8141217][1], f, SEARCH["Raley's"][1]);
  assert.equal(row.title, 'Propel Beverage or Gatorade');
  assert.equal(row.discount, '$0.99');
  assert.equal(row.discount_type, 'fixed');
  assert.equal(row.discount_value, 1.01);
  assert.equal(row.code, null);
  assert.equal(row.expiry_date, '2026-09-29');
  assert.equal(row.url, 'https://raleys.com');
  assert.match(row.description, /^Buy 4 or more\. \+CRV CA only Single Item \$2\.00 ea\. Regular \$2\.00, you save \$1\.01\. Raley's weekly ad price, valid Sep 23 to Sep 29\./);
  assert.equal(toCouponRow(ITEMS[8141217][3], f), null, 'an unpriced tile is not a row');
});

test('the home metro is read first, even when another metro has a flyer ending sooner', () => {
  const q = (id, postal_code, valid_to) => ({ id, merchant: String(id), merchant_id: id, logo: null, postal_code, valid_to });
  const queue = [q(1, '10001', '2026-09-26'), q(2, '95814', '2026-09-29'), q(3, '95814', '2026-09-26'), q(4, '99999', '2026-09-20')];
  assert.deepEqual(queue.sort(readOrder(['95814', '10001'])).map((f) => f.id), [3, 2, 1, 4]);
});

test('a run reads the first flyers of the queue, the next run carries on', async () => {
  const { fetchImpl, calls } = fakeFlipp();
  const r1 = await syncFlippWeeklyAds(db, opts(fetchImpl, '2026-09-25T20:00:00Z'));
  assert.equal(r1.skipped, false);
  // Raley's, Walmart (once), CVS and Wegmans; not Best Buy (electronics) or last week's Safeway.
  assert.equal(r1.listed, 4);
  assert.equal(r1.flyers.length, 2);
  assert.equal(r1.remaining, 2);
  assert.ok(r1.flyers.every((f) => f.postal_code === '95814'), 'Sacramento is read before New York');
  assert.equal(calls.filter((u) => u.includes('/flyers?')).length, 2, 'one listing per postal code');

  const r2 = await syncFlippWeeklyAds(db, opts(fetchImpl, '2026-09-25T20:10:00Z'));
  assert.equal(r2.flyers.length, 2);
  assert.equal(r2.remaining, 0);
  assert.equal(calls.filter((u) => u.includes('/flyers?')).length, 2, 'the queue is reused, not rebuilt');
  const stores = [...r1.flyers, ...r2.flyers].map((f) => f.store).sort();
  assert.deepEqual(stores, ['CVS Pharmacy', "Raley's", 'Walmart', 'Wegmans']);

  const r3 = await syncFlippWeeklyAds(db, opts(fetchImpl, '2026-09-25T20:20:00Z'));
  assert.equal(r3.flyers.length, 0, 'nothing is read twice in a week');

  const rows = await db.sql`
    SELECT c.title, c.discount, c.code, c.url, c.image_url, c.expiry_date, s.slug, s.website
    FROM coupons c JOIN stores s ON s.id = c.store_id WHERE c.source = 'flipp' ORDER BY c.source_id
  `;
  assert.equal(rows.length, 6, '3 Raley\'s prices (not the tile), 1 Walmart, 1 CVS, 1 Wegmans');
  const chicken = rows.find((r) => r.title === 'Foster Farms Fresh Whole Fryer Chicken');
  assert.equal(chicken.discount, '$0.97/lb', 'the unit came from the search');
  assert.equal(chicken.slug, 'raleys');
  assert.equal(chicken.image_url, 'https://f.wishabi.net/page_items/1041311431/extra_large.jpg');
  const milk = rows.find((r) => r.slug === 'walmart');
  assert.equal(milk.discount, '$3.12', 'no search words, the plain price');
});

test('the reveal sweep leaves weekly-ad rows alone', async () => {
  const [{ n }] = await db.sql`SELECT COUNT(*) AS n FROM coupons WHERE source = 'flipp' AND code IS NULL`;
  assert.ok(Number(n) > 0);
  const d = { mcp: { callTool: async () => { throw new Error('the browser must not be opened for a circular'); } }, anthropic: null };
  const r = await sweepReveals(db, d, { limit: 3 });
  assert.equal(r.checked.length, 0);
  assert.equal(r.remaining, 0);
});

test('a week later, last week\'s prices are removed unless a bounty holds one', async () => {
  const [held] = await db.sql`SELECT id FROM coupons WHERE source = 'flipp' ORDER BY id LIMIT 1`;
  await db.sql`
    INSERT INTO bounties (creator_did, store_name, title, reward_usd, status, coupon_id)
    VALUES ('did:test', 'Raley''s', 'Cheaper chicken', 1, 'claimed', ${held.id})
  `;
  const { fetchImpl } = fakeFlipp();
  const r = await syncFlippWeeklyAds(db, opts(fetchImpl, '2026-10-01T20:00:00Z'));
  assert.equal(r.pruned, 5);
  const left = await db.sql`SELECT id FROM coupons WHERE source = 'flipp'`;
  assert.deepEqual(left.map((x) => Number(x.id)), [Number(held.id)]);
});
