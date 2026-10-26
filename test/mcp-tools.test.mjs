// The MCP coupon tools against the real migration in a local libSQL file.
// db.sql binds every ${} as a parameter, so a column list interpolated into
// a SELECT comes back as one string column instead of the coupon; this
// proves each tool returns the coupon's own fields.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock } from 'bun:test';

// db.ts and mcp-tools.ts open with `import 'server-only'`, which only Next resolves.
mock.module('server-only', () => ({}));

const dir = mkdtempSync(join(tmpdir(), 'c0upons-mcp-tools-'));
const url = `file:${join(dir, 'local.db')}`;
execFileSync('node', ['apps/web/scripts/migrate.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '' },
  stdio: 'pipe',
});
const { getDb } = await import('../apps/web/lib/db.ts');
const { TOOLS } = await import('../apps/web/lib/mcp-tools.ts');
const db = getDb();
const tool = (name) => TOOLS.find((t) => t.name === name);
let couponId;

// db.ts opens its client from DATABASE_URL on the first query. Unset it right
// after: bun runs every test file in one process, and the other files'
// migrate.mjs children would inherit it and prefer it over their own database.
before(async () => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  await db.sql`INSERT INTO stores (name, slug) VALUES ('Nike', 'nike')`;
  const [store] = await db.sql`SELECT id FROM stores WHERE slug = 'nike'`;
  await db.sql`INSERT INTO coupons (store_id, code, title, votes) VALUES (${store.id}, 'SAVE20', '20% off shoes', 5)`;
  [{ id: couponId }] = await db.sql`SELECT id FROM coupons`;
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});

after(() => rmSync(dir, { recursive: true, force: true }));

function assertCoupon(c) {
  assert.equal(c['?column?'], undefined);
  assert.equal(c.code, 'SAVE20');
  assert.equal(c.title, '20% off shoes');
  assert.equal(Number(c.votes), 5);
}

test('search_coupons returns the coupon fields', async () => {
  const r = await tool('search_coupons').run({ q: 'shoes' });
  assert.equal(r.count, 1);
  assertCoupon(r.coupons[0]);
  assert.equal(r.coupons[0].store_slug, 'nike');
});

test('top_coupons returns the coupon fields', async () => {
  const r = await tool('top_coupons').run({ limit: 5 });
  assertCoupon(r.coupons[0]);
});

test('store_coupons returns the coupon fields', async () => {
  const r = await tool('store_coupons').run({ slug: 'nike' });
  assertCoupon(r.coupons[0]);
});

test('get_coupon returns the coupon fields', async () => {
  const r = await tool('get_coupon').run({ id: couponId });
  assertCoupon(r);
  assert.equal(r.store_name, 'Nike');
});
