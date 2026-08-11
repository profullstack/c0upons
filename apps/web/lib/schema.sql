-- Reference copy of the c0upons schema.
--
-- scripts/migrate.mjs is what actually creates and evolves the database; this
-- file documents the result. It is dumped from a database built by that script,
-- so the two agree — an earlier copy of this file stopped at blog_posts and
-- omitted coupon_votes and bounties entirely, which made rebuilding from it
-- silently incomplete. Regenerate with `turso db shell <db> ".schema"` after
-- changing the migration rather than hand-editing.

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  website     TEXT,
  category_id INTEGER REFERENCES categories(id),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id       INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code           TEXT,
  title          TEXT NOT NULL,
  description    TEXT,
  discount       TEXT,
  discount_type  TEXT,
  discount_value REAL,
  expiry_date    TEXT,
  url            TEXT,
  image_url      TEXT,
  votes          INTEGER NOT NULL DEFAULT 0,
  verified       INTEGER NOT NULL DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupon_votes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id  INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  voter_did  TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(coupon_id, voter_did)
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  excerpt         TEXT,
  content         TEXT NOT NULL DEFAULT '',
  cover_image     TEXT,
  thumbnail_image TEXT,
  banner_image    TEXT,
  author          TEXT,
  status          TEXT NOT NULL DEFAULT 'published',
  source          TEXT,
  source_id       TEXT,
  published_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bounties (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id   TEXT,
  creator_did TEXT NOT NULL,
  store_id    INTEGER REFERENCES stores(id),
  store_name  TEXT,
  title       TEXT NOT NULL,
  description TEXT,
  url         TEXT,
  reward_usd  REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  payment_id  TEXT,
  coupon_id   INTEGER REFERENCES coupons(id),
  claimer_did TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupons_store ON coupons(store_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON blog_posts(status, published_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_source_id ON blog_posts(source, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bounties_public_id ON bounties(public_id);
