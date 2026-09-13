// r/couponcodes is the second thing that puts rows into c0upons, and the first
// that reads free-form posts, so this runs it end to end: the real migration
// against a local libSQL file, a fake Reddit that answers 429 the way it does
// to a datacenter, a fake Obscura relay that hands back the feed, and then the
// same feed again to prove a second run updates rather than duplicates. The
// entries are the real shapes seen in the feed on 2026-09-13.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createClient } = await import(require.resolve('@libsql/client'));
const {
  syncRedditCouponcodes, fetchFeed, parseFeed, toCouponRow, bodyText, extractCode, codeFromUrl, storeFromTitle, parseDiscount, isPlausibleCode,
} = await import('../apps/web/lib/reddit-sync.ts');

const dir = mkdtempSync(join(tmpdir(), 'c0upons-reddit-'));
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

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One Atom entry the way Reddit writes it: the body is HTML, escaped inside <content>. */
function entry(id, title, html, { updated = '2026-09-13T10:00:00+00:00', author = 'someone' } = {}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
  const body = `${html} submitted by <a href="https://www.reddit.com/user/${author}"> /u/${author} </a> <span><a href="https://www.reddit.com/r/couponcodes/comments/${id}/${slug}/">[comments]</a></span>`;
  return `<entry><author><name>/u/${author}</name></author><category term="couponcodes" label="r/couponcodes"/>` +
    `<content type="html">${esc(body)}</content><id>t3_${id}</id>` +
    `<link href="https://www.reddit.com/r/couponcodes/comments/${id}/${slug}/" /><updated>${updated}</updated>` +
    `<title>${esc(title)}</title></entry>`;
}

const ENTRIES = [
  // Our own coupon reposted to the subreddit: an echo, must be declined.
  entry('1wf5dvp', 'ChatGPT Business: 2 seats for the price of 1 for 48 months ($25/mo off)',
    '<div class="md"><p>code: tdsynnexus</p></div> <a href="https://c0upons.com/coupons/647">[link]</a>'),
  // A link post: the store is in the title, the link is a shortener.
  entry('1wf40lq', '$10 off $60 Woolino', '<a href="https://prz.io/O5oZ5jeCL">[link]</a>'),
  // A request for a code: conversation, declined.
  entry('1wf0qrz', 'Discount Schuh', '<div class="md"><p>would any of you please spare a schuh code for a gal who&#39;s sadly graduated now :((</p></div>'),
  // A code in the body, store in the title.
  entry('1wecydg', 'Sideline Swap Coupon Code: Get $5 Off Your First Purchase',
    '<div class="md"><p>Sideline Swap Coupon Code: weibelt506</p><p>Sideline Swap is a platform for athletes looking to buy or sell gear.</p></div>'),
  // "at Wonder" in the title, three deep links to the store.
  entry('1wdr7ep', 'Get $30 Off ($15 Off first 2 orders) at Wonder using the link below',
    '<div class="md"><p>Wonder lets you order from 20+ restaurants. <a href="https://app.wonder.com/7ucn2iVuuRb">https://app.wonder.com/7ucn2iVuuRb</a></p></div>'),
  // "Use referral code: X", no link; the title names the store plus a month.
  entry('1wd2lmn', 'WAYMO September Referral Code',
    '<div class="md"><p>Get $10 off your first ride with Waymo. Works in all cities in the US! Use referral code: NAVEENGC5P</p></div>'),
  // No store in the title at all: the link host names it.
  entry('1wcqgqg', 'compost pick up service atlanta',
    '<div class="md"><p>ten dollars off in addition to first few pickups free! <a href="https://compostnow.org/share/KPSCC">https://compostnow.org/share/KPSCC</a></p></div>'),
];

const feedXml = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><category term="couponcodes" label="r/couponcodes"/>` +
  `<updated>2026-09-13T11:41:36+00:00</updated><id>/r/couponcodes/new.rss?limit=25</id><title>newest submissions : couponcodes</title>${entries.join('')}</feed>`;

/** Reddit refuses us, the relay does not. */
function fakeNetwork(entries) {
  const calls = [];
  const fetchImpl = async (u, init = {}) => {
    calls.push({ url: u, method: init.method ?? 'GET' });
    if (u.startsWith('https://www.reddit.com/')) return { ok: false, status: 429, text: async () => '' };
    if (u === 'https://relay.test/mcp') {
      const req = JSON.parse(init.body);
      assert.equal(req.params.name, 'fetch_page');
      assert.equal(req.params.arguments.format, 'original');
      return {
        ok: true, status: 200,
        text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: feedXml(entries) }], isError: false } }),
      };
    }
    throw new Error(`unexpected fetch ${u}`);
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

test('the feed parses into entries with decoded bodies', () => {
  const entries = parseFeed(feedXml(ENTRIES));
  assert.equal(entries.length, 7);
  assert.equal(entries[0].id, 't3_1wf5dvp');
  assert.equal(entries[0].author, '/u/someone');
  assert.match(entries[0].content, /<p>code: tdsynnexus<\/p>/, 'the HTML body is decoded once');
  assert.equal(bodyText(entries[2].content), "would any of you please spare a schuh code for a gal who's sadly graduated now :((");
});

test('codes, stores and discounts come out of prose', () => {
  assert.equal(extractCode('Sideline Swap Coupon Code: weibelt506'), 'weibelt506');
  assert.equal(extractCode('Use referral code: NAVEENGC5P'), 'NAVEENGC5P');
  assert.equal(extractCode('code: tdsynnexus'), 'tdsynnexus');
  assert.equal(extractCode('spare a schuh code for a gal'), null, 'a word after "code" is not a code');
  assert.equal(extractCode('use the code below at checkout'), null);
  assert.equal(extractCode('Mila and Rose Coupon Code: http://rwrd.io/hppc1zz?s'), null, 'a link after "code:" is not a code');
  assert.equal(extractCode('YAMI $20-$150 off w/ promo code 86778954 for new users'), '86778954', 'a long numeric code counts');
  assert.equal(extractCode('Mila and Rose Coupon Code: Save $10 on dresses'), null, 'a short word after "code:" is not a code');
  assert.equal(isPlausibleCode('2026'), false);
  assert.equal(isPlausibleCode('Save'), false);
  assert.equal(isPlausibleCode('tdsynnexus'), true);
  assert.equal(isPlausibleCode('19.99'), false);
  assert.equal(isPlausibleCode('SAVE20'), true);
  assert.equal(codeFromUrl('https://www.dermstore.com/referrals.list?applyCode=TODD-RCA'), 'TODD-RCA');
  assert.equal(codeFromUrl('https://www.wonder.com/order?auto_applied_promo_code=CINDY525'), 'CINDY525');
  assert.equal(codeFromUrl('https://koinly.io/?via=7B0B0B4B&utm_source=friend'), null, 'an affiliate id is not a code');

  assert.equal(storeFromTitle('$10 off $60 Woolino'), 'Woolino');
  assert.equal(storeFromTitle('Sideline Swap Coupon Code: Get $5 Off Your First Purchase'), 'Sideline Swap');
  assert.equal(storeFromTitle('Get $30 Off ($15 Off first 2 orders) at Wonder using the link below'), 'Wonder');
  assert.equal(storeFromTitle('WAYMO September Referral Code'), 'WAYMO');
  assert.equal(storeFromTitle('Netcup Voucher Codes'), 'Netcup');
  assert.equal(storeFromTitle('Sunday Lawn Care Coupon: Get $50 Off Your Full Year Custom Lawn Plan'), 'Sunday Lawn Care');
  assert.equal(storeFromTitle('compost pick up service atlanta'), null);
  assert.equal(storeFromTitle('YAMI $20-$150 off w/ promo code 86778954 for new users'), 'YAMI');
  assert.equal(storeFromTitle('20% discount NZ made supplements, site wide: EDH20'), null, 'starts with a percentage, names nobody');
  assert.equal(storeFromTitle('Invite link for BestSecret with 20% discount voucher'), 'Invite for BestSecret', 'a fragment the link host will replace');

  assert.deepEqual(parseDiscount('$10 off $60 Woolino'), { type: 'fixed', value: 10 });
  assert.deepEqual(parseDiscount('20% off headphones'), { type: 'percent', value: 20 });
  assert.deepEqual(parseDiscount('a free month'), { type: null, value: null });
});

test('a post maps to a coupon with its store, or to nothing', () => {
  const entries = parseFeed(feedXml(ENTRIES));
  const rows = entries.map(toCouponRow);
  assert.equal(rows[0], null, 'our own coupon coming back round is declined');
  assert.equal(rows[2], null, 'a request for a code is conversation');

  assert.equal(rows[1].store.slug, 'woolino');
  assert.equal(rows[1].store.website, null, 'a shortener names no site');
  assert.equal(rows[1].url, 'https://prz.io/O5oZ5jeCL');
  assert.equal(rows[1].discount, '$10 off');
  assert.equal(rows[1].code, null);

  assert.equal(rows[3].code, 'weibelt506');
  assert.deepEqual([rows[3].store.name, rows[3].store.slug], ['Sideline Swap', 'sideline-swap']);
  assert.equal(rows[3].url, entries[3].link, 'no link out, so the post itself');
  assert.match(rows[3].url, /^https:\/\/www\.reddit\.com\/r\/couponcodes\/comments\/1wecydg\//);
  assert.equal(rows[3].source_id, 'couponcodes:1wecydg');

  assert.deepEqual(rows[4].store, {
    name: 'Wonder', slug: 'wonder', website: 'https://wonder.com',
    logo_url: 'https://www.google.com/s2/favicons?domain=wonder.com&sz=128',
  });
  assert.equal(rows[4].url, 'https://app.wonder.com/7ucn2iVuuRb');
  assert.equal(rows[4].discount, '$30 off');

  assert.equal(rows[5].code, 'NAVEENGC5P');
  assert.equal(rows[5].store.slug, 'waymo');
  assert.equal(rows[5].discount, '$10 off');

  assert.deepEqual([rows[6].store.name, rows[6].store.slug, rows[6].store.website], ['Compostnow', 'compostnow', 'https://compostnow.org']);

  // One brand, two titles: the link's host wins over "Deutscher Starlink".
  const german = toCouponRow(parseFeed(feedXml([
    entry('1wd4fc2', 'Deutscher Starlink-Gutschein: Hol dir einen kostenlosen Bonusmonat',
      '<div class="md"><p>Starlink-Gutschein: <a href="https://www.starlink.com/?referral=RC-670718-74969-31">https://www.starlink.com/?referral=RC-670718-74969-31</a></p></div>'),
  ]))[0]);
  assert.deepEqual([german.store.name, german.store.slug], ['Starlink', 'starlink']);
  assert.equal(german.code, 'RC-670718-74969-31', 'the referral code rides in the link');

  // A code that only lives in the link's query string.
  const derm = toCouponRow(parseFeed(feedXml([
    entry('1wblup6', 'Dermstore Coupon Code: Take 15% Off Your First Order (2026 Referral Discount)',
      '<div class="md"><p>Use my link: <a href="https://www.dermstore.com/referrals.list?applyCode=TODD-RCA">https://www.dermstore.com/referrals.list?applyCode=TODD-RCA</a></p></div>'),
  ]))[0]);
  assert.equal(derm.code, 'TODD-RCA');
  assert.equal(derm.store.slug, 'dermstore');
  assert.equal(derm.discount, '15%');

  // A title that is a sentence: the host it links to names the store.
  const best = toCouponRow(parseFeed(feedXml([
    entry('1wbp9md', 'Invite link for BestSecret with 20% discount voucher',
      '<div class="md"><p><a href="https://invite.bestsecret.com/VU9-7VH-23Q?v=1a085012c1d&amp;c=de">https://invite.bestsecret.com/VU9-7VH-23Q</a></p></div>'),
  ]))[0]);
  assert.deepEqual([best.store.name, best.store.slug, best.store.website], ['Bestsecret', 'bestsecret', 'https://bestsecret.com']);
});

test('the feed is read through the relay when reddit refuses, and never through nothing', async () => {
  const net = fakeNetwork(ENTRIES);
  const feed = await fetchFeed('https://www.reddit.com/r/couponcodes/new.rss?limit=25', { fetch: net.fetchImpl, relayUrl: 'https://relay.test/mcp' });
  assert.equal(feed.via, 'relay');
  assert.deepEqual(net.calls.map((c) => c.method), ['GET', 'POST']);
  await assert.rejects(
    fetchFeed('https://www.reddit.com/r/couponcodes/new.rss', { fetch: net.fetchImpl, relayUrl: null }),
    /reddit answered 429 .* no relay/
  );
});

test('a run writes the listings, a second run updates in place and keeps a revealed code', async () => {
  const net = fakeNetwork(ENTRIES);
  const opts = { fetch: net.fetchImpl, feedUrl: 'https://www.reddit.com/r/couponcodes/new.rss?limit=25', relayUrl: 'https://relay.test/mcp' };

  const first = await syncRedditCouponcodes(db, opts);
  assert.equal(first.skipped, false);
  assert.equal(first.via, 'relay');
  assert.equal(first.fetched, 7);
  assert.equal(first.declined, 2);
  assert.equal(first.inserted, 5);
  assert.equal(first.updated, 0);
  assert.equal(first.stores, 5);
  assert.equal(first.newest, 't3_1wf5dvp');

  const stores = await db.sql`SELECT slug FROM stores ORDER BY slug`;
  assert.deepEqual(stores.map((s) => s.slug), ['compostnow', 'sideline-swap', 'waymo', 'wonder', 'woolino']);
  const [{ n }] = await db.sql`SELECT COUNT(*) AS n FROM coupons WHERE source = 'reddit'`;
  assert.equal(Number(n), 5);
  const [row] = await db.sql`SELECT code, discount, url, created_at FROM coupons WHERE source_id = 'couponcodes:1wd2lmn'`;
  assert.equal(row.code, 'NAVEENGC5P');
  assert.equal(row.discount, '$10 off');
  assert.equal(row.created_at, '2026-09-13T10:00:00+00:00');

  // The throttle: a run right after answers skipped without touching the network.
  const calls = net.calls.length;
  const throttled = await syncRedditCouponcodes(db, opts);
  assert.equal(throttled.skipped, true);
  assert.equal(throttled.newest, 't3_1wf5dvp');
  assert.equal(net.calls.length, calls);

  // The browser reveal finds Woolino's code later; the next read of the feed must keep it.
  await db.sql`UPDATE coupons SET code = 'WOOL10', code_source = 'obscura' WHERE source_id = 'couponcodes:1wf40lq'`;
  const later = () => new Date(Date.now() + 10 * 60_000);
  const second = await syncRedditCouponcodes(db, { ...opts, now: later });
  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 5);
  const [{ n: again }] = await db.sql`SELECT COUNT(*) AS n FROM coupons WHERE source = 'reddit'`;
  assert.equal(Number(again), 5, 'no duplicates');
  const [wool] = await db.sql`SELECT code FROM coupons WHERE source_id = 'couponcodes:1wf40lq'`;
  assert.equal(wool.code, 'WOOL10');
});
