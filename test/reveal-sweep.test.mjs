// The sweep: the real migration against a local libSQL file, a few coupons
// in different states, and a fake Obscura whose pages reveal a code for one
// URL and nothing for the rest. It proves which rows are picked, in what
// order, what gets written, and that a page with nothing is left alone.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { createClient } = await import(require.resolve('@libsql/client'));
const { ObscuraMcpClient } = await import('../apps/web/lib/obscura-mcp.ts');
const { sweepReveals, revealForCoupon } = await import('../apps/web/lib/reveal-coupon.ts');

const dir = mkdtempSync(join(tmpdir(), 'c0upons-sweep-'));
const url = `file:${join(dir, 'local.db')}`;
let client;
const db = {
  sql: async (strings, ...values) => {
    const rs = await client.execute({ sql: strings.join('?'), args: values.map((v) => (v === undefined ? null : v)) });
    return rs.rows;
  },
};

/** An Obscura where the page at `codedUrl` shows a code and every other page shows none. */
function fakeMcp(codedUrl) {
  let current = '';
  const visited = [];
  const fetchImpl = async (_u, init) => {
    const body = JSON.parse(init.body);
    if (body.id === undefined) return new Response('', { status: 202 });
    let result = {};
    if (body.method === 'initialize') result = { protocolVersion: '2024-11-05' };
    else if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params;
      let text = 'ok';
      if (name === 'browser_navigate') { current = args.url; visited.push(args.url); text = `Navigated to ${args.url} — "Deal"`; }
      if (name === 'browser_interactive_elements') text = 'ref=e1    a    "Home"';
      if (name === 'browser_search') text = current === codedUrl ? '1 match(es). {"offset":1,"snippet":"use coupon code HIDDEN77 at checkout"}' : 'No matches for "code".';
      result = { content: [{ type: 'text', text }] };
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, visited };
}

before(async () => {
  execFileSync('node', ['apps/web/scripts/migrate.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  client = createClient({ url });
  await db.sql`INSERT INTO stores (name, slug) VALUES ('Amazon', 'amazon')`;
  const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const recent = new Date(Date.now() - 3_600_000).toISOString();
  const rows = [
    ['has code', 'KEEP1', 'https://deal.test/a', 90, null],
    ['top voted, hidden code', null, 'https://deal.test/hidden', 50, null],
    ['no code, never read', null, 'https://deal.test/b', 20, null],
    ['read a week ago', null, 'https://deal.test/c', 10, old],
    ['read an hour ago', null, 'https://deal.test/d', 99, recent],
    ['no url', null, null, 70, null],
  ];
  for (const [title, code, u, votes, checked] of rows) {
    await db.sql`INSERT INTO coupons (store_id, title, code, url, votes, code_checked_at) VALUES (1, ${title}, ${code}, ${u}, ${votes}, ${checked})`;
  }
});

after(() => {
  client?.close();
  rmSync(dir, { recursive: true, force: true });
});

test('the sweep reads code-less coupons most-voted first, skips the recent and the codeless-by-design, and stores what it finds', async () => {
  const page = fakeMcp('https://deal.test/hidden');
  const d = { mcp: new ObscuraMcpClient('http://obscura.test/mcp', { fetch: page.fetchImpl }), anthropic: null };

  const first = await sweepReveals(db, d, { limit: 2 });
  assert.equal(first.checked.length, 2);
  assert.deepEqual(page.visited, ['https://deal.test/hidden', 'https://deal.test/b'], 'by votes, and never the row read an hour ago, the one with a code, or the one without a URL');
  assert.equal(first.found, 1);
  assert.equal(first.remaining, 1, 'the week-old one is still waiting');
  assert.equal(first.checked[0].engine, 'heuristic');

  const [hidden] = await db.sql`SELECT code, code_source, code_checked_at FROM coupons WHERE url = 'https://deal.test/hidden'`;
  assert.equal(hidden.code, 'HIDDEN77');
  assert.equal(hidden.code_source, 'obscura');
  assert.ok(hidden.code_checked_at);
  const [b] = await db.sql`SELECT code, code_checked_at FROM coupons WHERE url = 'https://deal.test/b'`;
  assert.equal(b.code, null);
  assert.ok(b.code_checked_at, 'a page with nothing is marked read so it is left alone');

  const second = await sweepReveals(db, d, { limit: 5 });
  assert.deepEqual(second.checked.map((c) => c.id).length, 1, 'only the week-old row was still due');
  assert.equal(second.remaining, 0);

  const third = await sweepReveals(db, d, { limit: 5 });
  assert.equal(third.checked.length, 0, 'nothing is due until a week passes');
});

test('a single reveal never overwrites a code that arrived meanwhile', async () => {
  const page = fakeMcp('https://deal.test/race');
  const d = { mcp: new ObscuraMcpClient('http://obscura.test/mcp', { fetch: page.fetchImpl }), anthropic: null };
  await db.sql`INSERT INTO coupons (store_id, title, code, url, votes) VALUES (1, 'race', 'SUBMITTED', 'https://deal.test/race', 1)`;
  const [row] = await db.sql`SELECT id FROM coupons WHERE url = 'https://deal.test/race'`;
  const out = await revealForCoupon(db, { id: Number(row.id), url: 'https://deal.test/race', title: 'race' }, d);
  assert.equal(out.code, 'HIDDEN77');
  const [after] = await db.sql`SELECT code FROM coupons WHERE id = ${row.id}`;
  assert.equal(after.code, 'SUBMITTED', 'the UPDATE is guarded by code IS NULL');
});
