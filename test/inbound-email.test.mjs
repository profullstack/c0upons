// coupons@profullstack.com is the first source that is pushed to us rather
// than polled, and the first that may click a link on our behalf, so this runs
// it end to end: the real migration against a local libSQL file, Forward
// Email-shaped payloads, a fake model, and a fake web that records every click.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createClient } = await import(require.resolve('@libsql/client'));
const {
  handleInboundEmail, confirmationLinks, isOptInConfirmation, extractByRules, normaliseOffers, verifySignature,
  isPublicUrl, storeFromSender, usable,
} = await import('../apps/web/lib/inbound-email.ts');

const dir = mkdtempSync(join(tmpdir(), 'c0upons-inbound-'));
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

const PASS = { dkim: { results: [{ status: { result: 'pass' }, signingDomain: 'e.bookshop.org' }] }, spf: { status: { result: 'pass' } } };
const publicDns = async () => ['93.184.216.34'];

function mail(over = {}) {
  return {
    from: { value: [{ address: 'news@e.bookshop.org', name: 'Bookshop.org' }], text: 'Bookshop.org <news@e.bookshop.org>' },
    to: { value: [{ address: 'coupons@profullstack.com' }] },
    subject: 'Banned Books Week: 20% off with code BBW26',
    text: 'Celebrate Banned Books Week. Take 20% off banned books with code BBW26 through October 10. Shop now: https://bookshop.org/lists/banned-books',
    html: '<p>Take 20% off banned books with code <b>BBW26</b>.</p><a href="https://bookshop.org/lists/banned-books">Shop now</a><a href="https://e.bookshop.org/unsubscribe?u=1">Unsubscribe</a>',
    messageId: `<${Math.random().toString(36).slice(2)}@e.bookshop.org>`,
    date: '2026-10-04T12:00:00Z',
    ...PASS,
    ...over,
  };
}

function fakeFetch() {
  const calls = [];
  const fn = async (u) => {
    calls.push(String(u));
    return new Response('ok', { status: 200 });
  };
  return { fn, calls };
}

test('Forward Email signatures verify against the body and nothing else', () => {
  const body = '{"subject":"x"}';
  const sig = createHmac('sha256', 'k3y').update(body).digest('hex');
  assert.equal(verifySignature(body, sig, 'k3y'), true);
  assert.equal(verifySignature(body + ' ', sig, 'k3y'), false);
  assert.equal(verifySignature(body, sig, undefined), false);
  assert.equal(verifySignature(body, null, 'k3y'), false);
});

test('the store is read off the sender', () => {
  assert.deepEqual(storeFromSender(mail()), { name: 'Bookshop.org', website: 'https://bookshop.org' });
  assert.deepEqual(storeFromSender(mail({ from: { value: [{ address: 'deals@mail.theproof.com', name: '' }] } })), {
    name: 'theproof',
    website: 'https://theproof.com',
  });
});

test('rules find the code and the discount without a model', () => {
  const x = extractByRules(mail());
  assert.equal(x.engine, 'rules');
  assert.equal(x.offers.length, 1);
  assert.equal(x.offers[0].code, 'BBW26');
  assert.equal(x.offers[0].discount_type, 'percent');
  assert.equal(x.offers[0].discount_value, 20);
  assert.equal(x.offers[0].url, 'https://bookshop.org/lists/banned-books');
});

test('a code the model made up is dropped, a sale without a link is not usable', () => {
  const offers = normaliseOffers(
    {
      offers: [
        { store_name: 'Bookshop.org', store_website: 'bookshop.org', code: 'FAKE2026', title: 'Invented', description: null, discount_type: 'percent', discount_value: 50, expiry_date: null, url: null },
        { store_name: 'Bookshop.org', store_website: null, code: 'BBW26', title: '20% off', description: null, discount_type: 'percent', discount_value: 20, expiry_date: '2026-10-10', url: 'https://bookshop.org/x' },
      ],
    },
    mail(),
  );
  assert.equal(offers[0].code, null);
  assert.equal(usable(offers[0]), false);
  assert.equal(offers[1].code, 'BBW26');
  assert.equal(offers[1].expiry_date, '2026-10-10');
  assert.equal(usable(offers[1]), true);
});

test('an offer is posted once, with source email, and the same mail again is not reprocessed', async () => {
  const m = mail({ subject: 'Fall sale: 15% off with code FALL15X', text: 'Use code FALL15X for 15% off everything. https://bookshop.org/' });
  const r = await handleInboundEmail(db, m, { model: null });
  assert.equal(r.outcome, 'posted');
  assert.deepEqual(r.posted.map((p) => p.code), ['FALL15X']);
  const rows = await db.sql`SELECT c.code, c.source, c.discount, s.slug FROM coupons c JOIN stores s ON s.id = c.store_id WHERE c.code = 'FALL15X'`;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'email');
  assert.equal(rows[0].discount, '15%');
  assert.equal(rows[0].slug, 'bookshop-org');

  const again = await handleInboundEmail(db, m, { model: null });
  assert.equal(again.outcome, 'already-processed');

  // A different newsletter with the same code at the same store is a duplicate.
  const resend = await handleInboundEmail(db, { ...m, messageId: '<other@e.bookshop.org>' }, { model: null });
  assert.equal(resend.outcome, 'duplicate');
  const log = await db.sql`SELECT outcome FROM inbound_emails ORDER BY id`;
  assert.deepEqual(log.map((l) => l.outcome), ['posted', 'duplicate']);
});

test('a code already posted by hand under a differently named store is a duplicate', async () => {
  await db.sql`INSERT INTO stores (name, slug, website) VALUES ('The Proof Peptides', 'the-proof-peptides', 'https://theproof.com')`;
  const [{ id }] = await db.sql`SELECT id FROM stores WHERE slug = 'the-proof-peptides'`;
  await db.sql`INSERT INTO coupons (store_id, code, title) VALUES (${id}, 'PROOF50', 'PROOF50')`;
  const model = async () => ({
    is_confirmation: false,
    offers: [{ store_name: 'The Proof', store_website: 'https://www.theproof.com', code: 'PROOF50', title: '50% off', description: null, discount_type: 'percent', discount_value: 50, expiry_date: null, url: null }],
  });
  const r = await handleInboundEmail(
    db,
    mail({ from: { value: [{ address: 'hi@theproof.com', name: 'The Proof' }] }, subject: 'Half off', text: 'Code PROOF50 takes 50% off.' }),
    { model },
  );
  assert.equal(r.engine, 'model');
  assert.equal(r.outcome, 'duplicate');
});

test('a mail with no offer is logged and skipped', async () => {
  const r = await handleInboundEmail(db, mail({ subject: 'Welcome to our community', text: 'Thanks for joining. We will be in touch with stories and news.', html: '<p>Thanks for joining.</p>' }), { model: null });
  assert.equal(r.outcome, 'no-offer');
  assert.equal(r.posted.length, 0);
});

test('forged mail (no DKIM, no SPF) posts nothing', async () => {
  const r = await handleInboundEmail(db, mail({ dkim: { results: [{ status: { result: 'fail' } }] }, spf: { status: { result: 'softfail' } }, subject: 'code FORGED99 for 90% off' }), { model: null });
  assert.equal(r.outcome, 'unauthenticated');
  assert.equal((await db.sql`SELECT id FROM coupons WHERE code = 'FORGED99'`).length, 0);
});

test('an opt-in confirmation clicks the confirm link and never the unsubscribe link', async () => {
  const m = mail({
    subject: 'Please confirm your subscription',
    text: 'One more step: please confirm your subscription to our deals newsletter.',
    html:
      '<a href="https://e.store.com/view?id=1">View in browser</a>' +
      '<a href="https://list.store.com/subscribe/confirm?u=abc&id=1">Yes, subscribe me to this list</a>' +
      '<a href="https://list.store.com/unsubscribe?u=abc">Unsubscribe</a>',
  });
  assert.equal(isOptInConfirmation(m), true);
  assert.deepEqual(confirmationLinks(m), ['https://list.store.com/subscribe/confirm?u=abc&id=1']);
  const web = fakeFetch();
  const r = await handleInboundEmail(db, m, { model: null, fetch: web.fn, resolve: publicDns });
  assert.equal(r.outcome, 'confirmed');
  assert.deepEqual(web.calls, ['https://list.store.com/subscribe/confirm?u=abc&id=1']);
});

test('a promotional mail is never clicked, even with "verify" in a link', async () => {
  const m = mail({ html: '<a href="https://bookshop.org/verify-age">Verify</a> 20% off with code BBW26X' });
  assert.equal(isOptInConfirmation(m), false);
  assert.deepEqual(confirmationLinks(m), []);
});

test('confirm links to private addresses are refused', async () => {
  assert.equal(await isPublicUrl('http://127.0.0.1/confirm'), false);
  assert.equal(await isPublicUrl('http://10.0.0.5/confirm'), false);
  assert.equal(await isPublicUrl('https://x.example/confirm', async () => ['192.168.1.2']), false);
  assert.equal(await isPublicUrl('https://x.example/confirm', publicDns), true);
  assert.equal(await isPublicUrl('ftp://x.example/'), false);
});
