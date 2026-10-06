// Coupons the email intake creates are posted to c0upons.com/bbs. What has to
// hold: each lands in the forum that fits it; the thread links back to the
// coupon; a coupon is posted once however often the mail is retried; the board's
// flood guard is waited out rather than lost; no token means nothing is posted;
// and the intake hands over exactly the coupons it created, with their ids.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createClient } = await import(require.resolve('@libsql/client'));
const { pickForum, topicFor, postCouponsToBbs } = await import('../apps/web/lib/bbs-post.ts');
const { handleInboundEmail } = await import('../apps/web/lib/inbound-email.ts');

const dir = mkdtempSync(join(tmpdir(), 'c0upons-bbs-'));
const url = `file:${join(dir, 'local.db')}`;
let client;
const db = {
  sql: async (strings, ...values) => {
    const rs = await client.execute({ sql: strings.join('?'), args: values.map((v) => (v === undefined ? null : v)) });
    return rs.rows;
  },
};

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

const coupon = (over = {}) => ({
  id: 42,
  store: 'Bookshop.org',
  storeSlug: 'bookshop-org',
  title: '20% off banned books',
  code: 'BBW26',
  description: 'Take 20% off banned books through October 10.',
  discount: '20% off',
  expiry_date: '2026-10-10',
  ...over,
});

/** A tsbb board that records every topic and can refuse with the flood guard. */
function board({ floodFirst = false } = {}) {
  const calls = [];
  let flooded = !floodFirst;
  const fetch = async (u, init) => {
    calls.push({ url: String(u), auth: init.headers.authorization, body: JSON.parse(init.body) });
    if (!flooded) {
      flooded = true;
      return new Response(JSON.stringify({ error: 'flooding', code: 'flooding' }), { status: 400 });
    }
    return new Response(JSON.stringify({ id: calls.length, slug: 't', url: `/t/t-${calls.length}` }), { status: 201 });
  };
  return { calls, fetch };
}

const noSleep = async () => {};

test('each coupon goes to the forum that fits it', () => {
  assert.equal(pickForum(coupon()), 'coupons');
  assert.equal(pickForum(coupon({ code: null, title: 'Spring sale up to 50% off' })), 'hot-deals');
  assert.equal(pickForum(coupon({ store: 'Kroger', title: '$5 off your grocery order', code: 'SAVE5' })), 'grocery');
  assert.equal(pickForum(coupon({ store: 'Best Buy', title: '$100 off laptops' })), 'tech-deals');
  assert.equal(pickForum(coupon({ store: 'Harbor Freight', title: '25% off one hand tool' })), 'home-deals');
  assert.equal(pickForum(coupon({ store: 'Sephora', title: '15% off makeup and skincare' })), 'fashion-deals');
  assert.equal(pickForum(coupon({ store: 'Expedia', title: '10% off hotels' })), 'travel-deals');
  assert.equal(pickForum(coupon({ store: 'Wendys', title: 'Free Frosty with any purchase', discount: null, code: null })), 'freebies');
  // Free shipping is a perk, not a freebie.
  assert.equal(pickForum(coupon({ title: '20% off plus free shipping' })), 'coupons');
});

test('the thread names the store and code and links back to the coupon', () => {
  const t = topicFor(coupon());
  assert.equal(t.title, 'Bookshop.org: 20% off banned books (code BBW26)');
  assert.match(t.body, /\*\*Code:\*\* `BBW26`/);
  assert.match(t.body, /\(https:\/\/c0upons\.com\/stores\/bookshop-org\)/);
  assert.match(t.body, /\(https:\/\/c0upons\.com\/coupons\/42\)/);
  assert.ok(!t.body.includes('\n\n\n'));
  assert.ok(topicFor(coupon({ title: 'x'.repeat(300) })).title.length <= 160);
});

test('a coupon is posted once, to the board, with the bearer token', async () => {
  const b = board();
  const first = await postCouponsToBbs(db, [coupon({ id: 101 })], { fetch: b.fetch, token: 'tsbb_x', baseUrl: 'https://c0upons.com/bbs', sleep: noSleep });
  assert.deepEqual(first.map((r) => r.status), ['posted']);
  assert.equal(first[0].url, 'https://c0upons.com/bbs/t/t-1');
  assert.equal(b.calls[0].url, 'https://c0upons.com/bbs/api/v1/forums/coupons/topics');
  assert.equal(b.calls[0].auth, 'Bearer tsbb_x');
  assert.equal(b.calls[0].body.format, 'markdown');

  const again = await postCouponsToBbs(db, [coupon({ id: 101 })], { fetch: b.fetch, token: 'tsbb_x', sleep: noSleep });
  assert.deepEqual(again.map((r) => r.status), ['already']);
  assert.equal(b.calls.length, 1);
});

test('the flood guard is waited out, and posts are spaced', async () => {
  const b = board({ floodFirst: true });
  const waits = [];
  const out = await postCouponsToBbs(db, [coupon({ id: 201 }), coupon({ id: 202, store: 'Kroger', title: '$5 off groceries' })], {
    fetch: b.fetch,
    token: 'tsbb_x',
    gapMs: 16_000,
    sleep: async (ms) => waits.push(ms),
  });
  assert.deepEqual(out.map((r) => r.status), ['posted', 'posted']);
  assert.equal(b.calls.length, 3); // one refused, retried, then the second coupon
  assert.ok(waits.length >= 2 && waits.every((ms) => ms > 0 && ms <= 16_000));
  assert.equal(out[1].forum, 'grocery');
});

test('no token: nothing is posted and nothing is recorded', async () => {
  const b = board();
  const out = await postCouponsToBbs(db, [coupon({ id: 301 })], { fetch: b.fetch, token: '', sleep: noSleep });
  assert.equal(out[0].status, 'disabled');
  assert.equal(b.calls.length, 0);
  const rows = await db.sql`SELECT * FROM bbs_posts WHERE coupon_id = ${301}`.catch(() => []);
  assert.equal(rows.length, 0);
});

test('a refusal other than flooding is recorded as failed, not retried', async () => {
  const calls = [];
  const fetch = async (u) => {
    calls.push(u);
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  };
  const out = await postCouponsToBbs(db, [coupon({ id: 401 })], { fetch, token: 'tsbb_x', sleep: noSleep });
  assert.equal(out[0].status, 'failed');
  assert.match(out[0].error, /403/);
  assert.equal(calls.length, 1);
  const [row] = await db.sql`SELECT status FROM bbs_posts WHERE coupon_id = ${401}`;
  assert.equal(row.status, 'failed');
});

test('the intake hands over the coupons it created, with their ids', async () => {
  const PASS = { dkim: { results: [{ status: { result: 'pass' }, signingDomain: 'e.bookshop.org' }] }, spf: { status: { result: 'pass' } } };
  const res = await handleInboundEmail(
    db,
    {
      from: { value: [{ address: 'news@e.bookshop.org', name: 'Bookshop.org' }], text: 'Bookshop.org <news@e.bookshop.org>' },
      to: { value: [{ address: 'submit@c0upons.com' }] },
      subject: 'Autumn reads: 15% off with code FALL15',
      text: 'Take 15% off everything with code FALL15 through October 31. Shop now: https://bookshop.org/fall',
      html: '<p>Take 15% off with code <b>FALL15</b>.</p><a href="https://bookshop.org/fall">Shop now</a>',
      messageId: `<${Math.random().toString(36).slice(2)}@e.bookshop.org>`,
      ...PASS,
    },
    { model: null, resolve: async () => ['93.184.216.34'] },
  );
  assert.equal(res.outcome, 'posted');
  assert.equal(res.created.length, 1);
  const [row] = await db.sql`SELECT id, code FROM coupons WHERE id = ${res.created[0].id}`;
  assert.equal(row.code, 'FALL15');
  assert.equal(res.created[0].storeSlug.length > 0, true);
  assert.equal(pickForum(res.created[0]), 'coupons');
});
