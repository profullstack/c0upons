/**
 * Database migration — creates tables and optionally seeds sample data.
 * Run with: pnpm db:migrate  (from apps/web)
 *
 * Requires SQLITECLOUD_URL in apps/web/.env.local or as an env var.
 */
import { Database } from '@sqlitecloud/drivers';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local manually (no dotenv dep in web)
try {
  const envPath = resolve(__dirname, '../.env.local');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) process.env[k.trim()] ??= rest.join('=').trim();
  }
} catch { /* no .env.local — fall through to existing env */ }

const url = process.env.SQLITECLOUD_URL;
if (!url) {
  console.error('SQLITECLOUD_URL not set');
  process.exit(1);
}

const db = new Database(url);

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
    expiry_date TEXT,
    url         TEXT,
    votes       INTEGER NOT NULL DEFAULT 0,
    verified    INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;
console.log('  coupons');

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
