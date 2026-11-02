// PeerPush deals (peerpush.com/deals) are the fourth thing that puts rows into
// c0upons. The page is a Next.js RSC render, so this builds one in the shape
// peerpush.com served on 2026-11-02 (products as JSON objects inside
// self.__next_f.push chunks, split mid-object, with RSC's $$ / $D / $<ref>
// escapes) and runs the sync end to end against the real migration on a
// local libSQL file: first run inserts, second updates in place, a later run
// removes a deal past its valid-until date.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const pgUrl = process.env.C0UPONS_TEST_DATABASE_URL;
const { createClient } = await import(require.resolve(pgUrl ? '@profullstack/libsql-pg' : '@libsql/client'));
const { syncPeerpushDeals, extractDeals, toCouponRow, flightText, rscString, stripTracking } = await import(
  '../apps/web/lib/peerpush-sync.ts'
);
const { parseDiscount } = await import('../apps/web/lib/reddit-sync.ts');

const dir = mkdtempSync(join(tmpdir(), 'c0upons-peerpush-'));
const url = pgUrl ?? `file:${join(dir, 'local.db')}`;
let client;
const db = {
  sql: async (strings, ...values) => {
    const rs = await client.execute({ sql: strings.join('?'), args: values.map((v) => (v === undefined ? null : v)) });
    return rs.rows;
  },
};

const product = (id, slug, name, deal, extra = {}) => ({
  id,
  slug,
  name,
  upvotes: 3,
  tagline: `${name} does things`,
  description: '$86',
  websiteUrl: `https://${slug}.example/?utm_source=peerpush&ref=pp`,
  logo: { id: 'logo' + id, url: `https://static.peerpush.test/${slug}.png`, type: 'image' },
  categories: [{ id: 'c1', name: 'Productivity', slug: 'productivity' }],
  upvoted: false,
  discountPercent: deal.pct ?? null,
  discountCode: deal.code ?? null,
  discountTitle: deal.title ?? null,
  discountValidUntil: deal.until ? `$D${deal.until}T00:00:00.000Z` : null,
  videoUrl: null,
  aiBadge: '$undefined',
  discountCreatedAt: '$D2026-10-20T11:59:39.240Z',
  ...extra,
});

const ID = (n) => `cmvs4qhi306il072f1ivv9${String(n).padStart(4, '0')}`;
const KLIPORT = product(ID(1), 'kliport', 'Kliport', { code: 'SAVE50', title: '50% OFF', pct: 50, until: '2026-12-31' });
const ZOLTRA = product(ID(2), 'zoltra', 'Zoltra', { code: 'PEER-20', title: '$$20 OFF', pct: 25, until: '2031-10-16' });
const LAYERZ = product(ID(3), 'layerz', 'Layerz', {
  code: 'https://apps.apple.com/redeem?ctx=offercodes&id=6499101592&code=PEERPUSH',
  title: '50% OFF',
  pct: 50,
  until: '2026-12-31',
}, { websiteUrl: 'https://apps.apple.com/us/app/layerz/id6499101592' });
const AIOMIZE = product(ID(4), 'aiomize-nhxd', 'Aiomize', { code: '-', title: 'Pay for a 4 month subscription get 6 month', pct: 30, until: '2026-12-31' });
const XIMOS = product(ID(5), 'ximos', 'Ximos', { code: 'XIMOS099', title: '$$0.99/Month', pct: 99, until: '2026-12-31' });
const ARROW = product(ID(6), 'arrowdeck', 'ArrowDeck', { code: 'KY2DF-7CPWJ-MKHJ2-VR2MC-2GTVZ', title: '"100% OFF"', until: '2026-11-15' });
const NO_DEAL = product(ID(7), 'groupings', 'Groupings', {});

/** A page the way Next streams it: one row of products, cut into chunks at arbitrary points. */
function page(products) {
  const payload = `0:["$","div",null,{"children":[]}]\n2a:${JSON.stringify(['$', '$L2b', null, { products }])}\n86:T40,long description\n`;
  const cuts = [0, 37, 911, 2400, payload.length].filter((n, i, a) => n <= payload.length && a.indexOf(n) === i);
  const chunks = cuts.slice(1).map((end, i) => payload.slice(cuts[i], end));
  const scripts = chunks.map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`).join('');
  return `<!doctype html><html><head><title>Deals | PeerPush</title></head><body>${scripts}</body></html>`;
}

const BASE = 'https://peerpush.test/deals';
let views;
const fetchText = async (u) => {
  if (!(u in views)) throw new Error(`unexpected fetch ${u}`);
  if (views[u] instanceof Error) throw views[u];
  return views[u];
};

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

test('rsc escapes decode to the values they stand for', () => {
  assert.equal(rscString('$$20 OFF'), '$20 OFF');
  assert.equal(rscString('$D2026-12-31T00:00:00.000Z'), '2026-12-31T00:00:00.000Z');
  assert.equal(rscString('$undefined'), null);
  assert.equal(rscString('$86'), null);
  assert.equal(rscString('SAVE50'), 'SAVE50');
  assert.match(flightText(page([KLIPORT])), /"discountCode":"SAVE50"/);
});

test('every product with a deal is found, across chunk boundaries, once', () => {
  const deals = extractDeals(page([KLIPORT, ZOLTRA, NO_DEAL, LAYERZ, KLIPORT]));
  assert.deepEqual(deals.map((d) => d.slug), ['kliport', 'zoltra', 'layerz']);
  assert.equal(deals[1].discountTitle, '$20 OFF');
  assert.equal(deals[0].logoUrl, 'https://static.peerpush.test/kliport.png');
  assert.equal(deals[0].category, 'Productivity');
});

test('a deal maps to a coupon: founder words over the computed percent, codes from redeem links', () => {
  const [k, z, l, a, x, ar] = extractDeals(page([KLIPORT, ZOLTRA, LAYERZ, AIOMIZE, XIMOS, ARROW])).map(toCouponRow);
  assert.equal(k.code, 'SAVE50');
  assert.equal(k.discount, '50%');
  assert.equal(k.title, 'Kliport: 50% OFF');
  assert.equal(k.url, 'https://kliport.example/?ref=pp');
  assert.equal(k.store.website, 'https://kliport.example');
  assert.equal(k.expiry_date, '2026-12-31');
  assert.equal(k.source, 'peerpush');
  assert.equal(k.source_id, ID(1));

  // "$20 OFF" arrives with discountPercent 25: the title wins.
  assert.deepEqual([z.discount_type, z.discount_value, z.discount], ['fixed', 20, '$20 off']);
  // A redeem link in the code field: the link is the url, its code= param the code, no App Store "website".
  assert.equal(l.code, 'PEERPUSH');
  assert.match(l.url, /^https:\/\/apps\.apple\.com\/redeem/);
  assert.equal(l.store.website, null);
  // "-" is no code; the percent is the fallback when the words carry none.
  assert.equal(a.code, null);
  assert.equal(a.discount, '30%');
  assert.equal(a.store.slug, 'aiomize');
  // A price is not 99% off.
  assert.equal(x.discount, null);
  // Quotes a founder typed are dropped; three-digit percents parse.
  assert.equal(ar.title, 'ArrowDeck: 100% OFF');
  assert.equal(ar.discount, '100%');
});

test('parseDiscount reads 100% off as 100, not 0', () => {
  assert.deepEqual(parseDiscount('100% OFF (First 100 redemptions only)'), { type: 'percent', value: 100 });
  assert.deepEqual(parseDiscount('save 2.5% off'), { type: 'percent', value: 2.5 });
  assert.deepEqual(parseDiscount('1000% off'), { type: null, value: null });
});

test('stripTracking keeps everything but utm_*', () => {
  assert.equal(stripTracking('https://a.example/?utm_source=x&utm_medium=y&ref=1'), 'https://a.example/?ref=1');
  assert.equal(stripTracking('not a url'), 'not a url');
});

test('sync: reads all four views, inserts, updates in place, throttles, prunes the expired', async () => {
  views = {
    [BASE]: page([KLIPORT, ZOLTRA, NO_DEAL]),
    [`${BASE}?type=big`]: page([KLIPORT, ARROW]),
    [`${BASE}?type=ending`]: new Error('peerpush answered 502'),
    [`${BASE}?type=free`]: page([LAYERZ]),
  };
  const day1 = () => new Date('2026-11-02T12:00:00Z');
  const r1 = await syncPeerpushDeals(db, { baseUrl: BASE, fetchText, now: day1 });
  assert.equal(r1.skipped, false);
  assert.equal(r1.pages, 3);
  assert.equal(r1.deals, 4);
  assert.equal(r1.inserted, 4);
  assert.ok(r1.added.includes('Zoltra: $20 OFF'));

  const rows = await db.sql`SELECT c.code, c.title, c.expiry_date, s.slug FROM coupons c JOIN stores s ON s.id = c.store_id WHERE c.source = 'peerpush' ORDER BY s.slug`;
  assert.deepEqual(rows.map((r) => r.slug), ['arrowdeck', 'kliport', 'layerz', 'zoltra']);

  // An hour's throttle for the public route.
  const again = await syncPeerpushDeals(db, { baseUrl: BASE, fetchText, now: () => new Date('2026-11-02T12:30:00Z') });
  assert.equal(again.skipped, true);

  // Next day the founder changes the code: same row, new code.
  views[BASE] = page([{ ...KLIPORT, discountCode: 'SAVE60', discountTitle: '60% OFF' }, ZOLTRA]);
  const r2 = await syncPeerpushDeals(db, { baseUrl: BASE, fetchText, now: () => new Date('2026-11-03T12:00:00Z') });
  assert.equal(r2.inserted, 0);
  assert.equal(r2.updated, 4);
  const [k] = await db.sql`SELECT code, title FROM coupons WHERE source = 'peerpush' AND source_id = ${ID(1)}`;
  assert.deepEqual([k.code, k.title], ['SAVE60', 'Kliport: 60% OFF']);

  // After ArrowDeck's 2026-11-15 valid-until: removed, and not re-added while PeerPush still lists it.
  const r3 = await syncPeerpushDeals(db, { baseUrl: BASE, fetchText, now: () => new Date('2026-11-16T12:00:00Z') });
  assert.equal(r3.pruned, 1);
  assert.equal(r3.declined, 1);
  const left = await db.sql`SELECT COUNT(*) AS n FROM coupons WHERE source = 'peerpush'`;
  assert.equal(Number(left[0].n), 3);
});

test('sync throws when no view answers', async () => {
  views = {};
  await assert.rejects(
    syncPeerpushDeals(db, { baseUrl: BASE, fetchText, minMinutesBetweenRuns: 0 }),
    /unexpected fetch/
  );
});
