/**
 * Database migration — creates tables and optionally seeds sample data.
 * Run with: pnpm db:migrate  (from apps/web)
 *
 * Requires SQLITECLOUD_URL in the repo root .env or as an env var.
 */
import { Database } from '@sqlitecloud/drivers';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'node:crypto';

// Mirror of apps/web/lib/id.ts — short, URL-safe, non-sequential public ids.
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function generatePublicId(length = 12) {
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return id;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the repo root .env manually (no dotenv dep in web).
try {
  const envPath = resolve(__dirname, '../../..', '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) process.env[k.trim()] ??= rest.join('=').trim();
  }
} catch { /* no root .env — fall through to existing env */ }

const url = process.env.SQLITECLOUD_URL;
if (!url) {
  console.error('SQLITECLOUD_URL not set');
  process.exit(1);
}

const db = new Database({ connectionstring: url, usewebsocket: true });

console.log('Running migrations...');

await db.sql`
  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;
console.log('  categories');

await db.sql`
  CREATE TABLE IF NOT EXISTS stores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    logo_url    TEXT,
    website     TEXT,
    category_id INTEGER REFERENCES categories(id),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;
console.log('  stores');

await db.sql`
  CREATE TABLE IF NOT EXISTS coupons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    code        TEXT,
    title       TEXT NOT NULL,
    description TEXT,
    discount    TEXT,
    discount_type  TEXT,
    discount_value REAL,
    expiry_date TEXT,
    url         TEXT,
    image_url   TEXT,
    votes       INTEGER NOT NULL DEFAULT 0,
    verified    INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;
await addColumn(() => db.sql`ALTER TABLE coupons ADD COLUMN discount_type TEXT`);
await addColumn(() => db.sql`ALTER TABLE coupons ADD COLUMN discount_value REAL`);
await addColumn(() => db.sql`ALTER TABLE coupons ADD COLUMN image_url TEXT`);
console.log('  coupons');

await db.sql`
  CREATE TABLE IF NOT EXISTS coupon_votes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    coupon_id  INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    voter_did  TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(coupon_id, voter_did)
  )
`;
console.log('  coupon_votes');

await db.sql`
  CREATE TABLE IF NOT EXISTS blog_posts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    excerpt      TEXT,
    content      TEXT NOT NULL DEFAULT '',
    cover_image  TEXT,
    thumbnail_image TEXT,
    banner_image TEXT,
    author       TEXT,
    status       TEXT NOT NULL DEFAULT 'published',
    source       TEXT,
    source_id    TEXT,
    published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;
await addColumn(() => db.sql`ALTER TABLE blog_posts ADD COLUMN thumbnail_image TEXT`);
await addColumn(() => db.sql`ALTER TABLE blog_posts ADD COLUMN banner_image TEXT`);
await addColumn(() => db.sql`ALTER TABLE blog_posts ADD COLUMN source TEXT`);
await addColumn(() => db.sql`ALTER TABLE blog_posts ADD COLUMN source_id TEXT`);
await db.sql`CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts(status, published_at)`;
await db.sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_source_id ON blog_posts(source, source_id)`;
console.log('  blog_posts');

await db.sql`
  CREATE TABLE IF NOT EXISTS bounties (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id     TEXT,
    creator_did   TEXT NOT NULL,
    store_id      INTEGER REFERENCES stores(id),
    store_name    TEXT,
    title         TEXT NOT NULL,
    description   TEXT,
    reward_usd    REAL NOT NULL,
    status        TEXT NOT NULL DEFAULT 'open',
    payment_id    TEXT,
    coupon_id     INTEGER REFERENCES coupons(id),
    claimer_did   TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;
// public_id: non-sequential URL identifier (added after initial release).
await addColumn(() => db.sql`ALTER TABLE bounties ADD COLUMN public_id TEXT`);
// Backfill any rows missing a public_id (existing bounties created pre-migration).
const needIds = await db.sql`SELECT id FROM bounties WHERE public_id IS NULL OR public_id = ''`;
for (const row of needIds) {
  await db.sql`UPDATE bounties SET public_id = ${generatePublicId()} WHERE id = ${row.id}`;
}
if (needIds.length) console.log(`  bounties: backfilled ${needIds.length} public_id(s)`);
await db.sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_bounties_public_id ON bounties(public_id)`;
console.log('  bounties');

const [{ n }] = await db.sql`SELECT COUNT(*) AS n FROM stores`;
if (n === 0) {
  console.log('  Seeding sample data...');
  await db.sql`INSERT INTO stores (name, slug, website) VALUES ('Amazon', 'amazon', 'https://amazon.com')`;
  await db.sql`INSERT INTO stores (name, slug, website) VALUES ('Nike', 'nike', 'https://nike.com')`;
  await db.sql`INSERT INTO stores (name, slug, website) VALUES ('Walmart', 'walmart', 'https://walmart.com')`;

  const stores = await db.sql`SELECT id, slug FROM stores`;
  const bySlug = Object.fromEntries(stores.map(s => [s.slug, s.id]));

  await db.sql`INSERT INTO coupons (store_id, code, title, discount, description, votes)
    VALUES (${bySlug.amazon}, 'SAVE10', '10% off your order', '10%', 'Use at checkout for 10% off any item', 42)`;
  await db.sql`INSERT INTO coupons (store_id, code, title, discount, description, votes)
    VALUES (${bySlug.amazon}, 'PRIME20', 'Prime members: 20% off', '20%', 'Exclusive Prime discount on electronics', 91)`;
  await db.sql`INSERT INTO coupons (store_id, code, title, discount, description, votes)
    VALUES (${bySlug.nike}, 'NIKE15', '15% off sitewide', '15%', 'Valid on all full-price items', 55)`;
  await db.sql`INSERT INTO coupons (store_id, code, title, discount, description, votes)
    VALUES (${bySlug.walmart}, 'WMT5OFF', '$5 off $50+', '$5 off', 'Minimum $50 order required', 30)`;
  console.log('  Seeded 3 stores, 4 coupons');
}

console.log('\nDone.');
process.exit(0);

async function addColumn(run) {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate column|already exists/i.test(message)) throw error;
  }
}
