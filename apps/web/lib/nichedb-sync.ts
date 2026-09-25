/**
 * Pull the nichedb.dev `deals` collection into stores and coupons.
 *
 * c0upons started empty, and an empty coupon site gets no submissions: nobody
 * types a code into a page with nothing on it. nichedb's deals collection is
 * the way out. It reads the deal communities' and deal desks' keyless feeds
 * (Slickdeals, DealNews, Dealcatcher, Ben's Bargains, r/deals) and publishes
 * one row per deal with the store under a stable key and any coupon code
 * lifted out of the prose. This module mirrors that into our own tables, so
 * every store page and the front page have something on them from day one.
 *
 * HOW IT KEEPS ITS PLACE
 *
 * The items API is read in id order with `after=<id>`, and the highest id seen
 * is written to `sync_state` when the run ends. A run reads at most a few
 * pages, so a cold start catches up over several runs rather than one long
 * request that a serverless timeout would kill halfway. A row is identified by
 * `(source, source_id)` where source_id is the upstream source slug plus the
 * upstream's own id, which is what survives nichedb renumbering its rows.
 *
 * WHAT IT DECLINES
 *
 * A deal that names no store has no page to live on and is skipped. A Reddit
 * post is a conversation, not a listing, and is taken only when it carries a
 * code. Everything else -- a deal, a sale, a product, a coupon -- becomes a
 * coupon row, code or not, because a store page with prices on it is what a
 * shopper came for, and CouponCard already renders a code-less row as a link.
 *
 * This file has no framework imports on purpose: the mapping and the run are
 * exercised by `test/nichedb-sync.test.mjs` under plain Node against a local
 * libSQL file, which is the same driver production uses.
 */

export const NICHEDB_URL = 'https://nichedb.dev';
export const SOURCE = 'nichedb';
export const PAGE_SIZE = 200;
export const MAX_PAGES_PER_RUN = 5;
export const MIN_MINUTES_BETWEEN_RUNS = 10;

export interface NichedbItem {
  id: number;
  source: string;
  kind: string;
  external_id: string;
  title: string;
  summary: string | null;
  url: string | null;
  image_url: string | null;
  published_at: string | null;
  tags: string[];
  data: {
    store?: string | null;
    storeKey?: string | null;
    storeDomain?: string | null;
    code?: string | null;
    discountType?: 'percent' | 'fixed' | null;
    discountValue?: number | null;
    price?: number | null;
    expires?: string | null;
    [k: string]: unknown;
  };
}

export interface StoreRow {
  name: string;
  slug: string;
  website: string | null;
  logo_url: string | null;
}

export interface CouponRow {
  store: StoreRow;
  source: string;
  source_id: string;
  code: string | null;
  title: string;
  description: string | null;
  discount: string | null;
  discount_type: 'percent' | 'fixed' | null;
  discount_value: number | null;
  expiry_date: string | null;
  url: string | null;
  image_url: string | null;
  created_at: string | null;
}

/** The one shape of `db` this module needs: the tagged template lib/db.ts exposes. */
export interface SqlDb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any>;
}

/** "amazon" and "best-buy" arrive as keys; a page title wants "Amazon" and "Best Buy". */
export function displayName(store: string, key: string | null | undefined): string {
  const s = store.trim();
  if (s !== s.toLowerCase()) return s;
  const words = (key || s).split(/[-\s]+/).filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** The badge text the cards show, from the structured discount. */
export function formatDiscount(
  type: 'percent' | 'fixed' | null | undefined,
  value: number | null | undefined
): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (type === 'percent') return `${value}%`;
  if (type === 'fixed') return `$${value} off`;
  return null;
}

/** An ISO timestamp to the YYYY-MM-DD the expiry column holds. */
export function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * One nichedb item to one coupon row with its store, or null when the item is
 * not something a store page can carry.
 */
export function toCouponRow(item: NichedbItem): CouponRow | null {
  const d = item.data ?? {};
  const store = typeof d.store === 'string' ? d.store.trim() : '';
  const slug = typeof d.storeKey === 'string' ? d.storeKey.trim() : '';
  if (!store || !slug) return null;
  const code = typeof d.code === 'string' && d.code.trim() ? d.code.trim() : null;
  if (item.kind === 'post' && !code) return null;
  if (!item.title || !item.external_id) return null;
  const domain = typeof d.storeDomain === 'string' && d.storeDomain ? d.storeDomain : null;
  const discountType = d.discountType === 'percent' || d.discountType === 'fixed' ? d.discountType : null;
  const discountValue =
    typeof d.discountValue === 'number' && Number.isFinite(d.discountValue) ? d.discountValue : null;
  return {
    store: {
      name: displayName(store, slug),
      slug,
      website: domain ? `https://${domain}` : null,
      logo_url: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null,
    },
    source: SOURCE,
    source_id: `${item.source}:${item.external_id}`,
    code,
    title: String(item.title).slice(0, 300),
    description: item.summary ? String(item.summary).slice(0, 2000) : null,
    discount: formatDiscount(discountType, discountValue),
    discount_type: discountType,
    discount_value: discountValue,
    expiry_date: dateOnly(typeof d.expires === 'string' ? d.expires : null),
    url: item.url ?? null,
    image_url: item.image_url ?? null,
    created_at: item.published_at ?? null,
  };
}

/**
 * The columns and the table this sync needs, created if they are missing.
 *
 * `scripts/migrate.mjs` declares the same things, but nothing runs it on
 * deploy, and a sync that 500s until someone remembers to is a manual setup
 * step. ALTER TABLE has no IF NOT EXISTS in SQLite, so an existing column is
 * detected by the error it raises.
 */
export async function ensureSyncSchema(db: SqlDb): Promise<void> {
  const addColumn = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (err) {
      if (!/duplicate column/i.test(String((err as Error)?.message ?? err))) throw err;
    }
  };
  await addColumn(() => db.sql`ALTER TABLE coupons ADD COLUMN source TEXT`);
  await addColumn(() => db.sql`ALTER TABLE coupons ADD COLUMN source_id TEXT`);
  await db.sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_source_id ON coupons(source, source_id)`;
  await db.sql`
    CREATE TABLE IF NOT EXISTS sync_state (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export async function getState(db: SqlDb, key: string): Promise<string | null> {
  const rows = await db.sql`SELECT value FROM sync_state WHERE key = ${key} LIMIT 1`;
  return rows.length ? (rows[0].value as string | null) : null;
}

export async function setState(db: SqlDb, key: string, value: string): Promise<void> {
  await db.sql`
    INSERT INTO sync_state (key, value, updated_at) VALUES (${key}, ${value}, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `;
}

/** Resolve the store by slug, creating it, and fill in a website or logo it lacked. */
export async function upsertStore(db: SqlDb, store: StoreRow): Promise<number> {
  await db.sql`
    INSERT INTO stores (name, slug, website, logo_url)
    VALUES (${store.name}, ${store.slug}, ${store.website}, ${store.logo_url})
    ON CONFLICT(slug) DO UPDATE SET
      website  = COALESCE(stores.website, excluded.website),
      logo_url = COALESCE(stores.logo_url, excluded.logo_url)
  `;
  const rows = await db.sql`SELECT id FROM stores WHERE slug = ${store.slug} LIMIT 1`;
  return Number(rows[0].id);
}

export async function upsertCoupon(db: SqlDb, storeId: number, row: CouponRow): Promise<void> {
  await db.sql`
    INSERT INTO coupons (
      store_id, code, title, description, discount, discount_type, discount_value,
      expiry_date, url, image_url, source, source_id, created_at
    ) VALUES (
      ${storeId}, ${row.code}, ${row.title}, ${row.description}, ${row.discount},
      ${row.discount_type}, ${row.discount_value}, ${row.expiry_date}, ${row.url},
      ${row.image_url}, ${row.source}, ${row.source_id},
      COALESCE(${row.created_at}, CURRENT_TIMESTAMP)
    )
    ON CONFLICT(source, source_id) DO UPDATE SET
      store_id       = excluded.store_id,
      code           = excluded.code,
      title          = excluded.title,
      description    = excluded.description,
      discount       = excluded.discount,
      discount_type  = excluded.discount_type,
      discount_value = excluded.discount_value,
      expiry_date    = excluded.expiry_date,
      url            = excluded.url,
      image_url      = excluded.image_url
  `;
}

export interface SyncOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  maxPages?: number;
  minMinutesBetweenRuns?: number;
  now?: () => Date;
}

export interface SyncResult {
  ok: true;
  skipped: boolean;
  reason?: string;
  fetched: number;
  upserted: number;
  stores: number;
  cursor: number | null;
  more: boolean;
}

/**
 * One run: read the pages after the cursor, write every row that maps, and
 * advance the cursor. Throttled so a public trigger cannot make nichedb pay
 * for someone's curiosity, and bounded so a run fits in a route's time budget.
 */
export async function syncNichedbDeals(db: SqlDb, opts: SyncOptions = {}): Promise<SyncResult> {
  const base = (opts.baseUrl ?? process.env.NICHEDB_URL ?? NICHEDB_URL).replace(/\/$/, '');
  const doFetch = opts.fetch ?? fetch;
  const maxPages = opts.maxPages ?? MAX_PAGES_PER_RUN;
  const minMinutes = opts.minMinutesBetweenRuns ?? MIN_MINUTES_BETWEEN_RUNS;
  const now = opts.now ?? (() => new Date());

  await ensureSyncSchema(db);

  const lastRun = await getState(db, 'nichedb:deals:last_run');
  if (lastRun && now().getTime() - new Date(lastRun).getTime() < minMinutes * 60_000) {
    const cursor = Number(await getState(db, 'nichedb:deals:after')) || null;
    return { ok: true, skipped: true, reason: 'ran recently', fetched: 0, upserted: 0, stores: 0, cursor, more: false };
  }
  await setState(db, 'nichedb:deals:last_run', now().toISOString());

  let cursor = Number(await getState(db, 'nichedb:deals:after')) || 0;
  let fetched = 0;
  let upserted = 0;
  const storeIds = new Map<string, number>();
  let more = false;

  for (let page = 0; page < maxPages; page++) {
    const url = `${base}/api/v1/items?collection=deals&sort=id&order=asc&limit=${PAGE_SIZE}&after=${cursor}`;
    const res = await doFetch(url, { headers: { accept: 'application/json', 'user-agent': 'c0upons-sync/1' } });
    if (!res.ok) throw new Error(`nichedb answered ${res.status} for ${url}`);
    const body = (await res.json()) as { items?: NichedbItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      more = false;
      break;
    }
    fetched += items.length;
    for (const item of items) {
      const row = toCouponRow(item);
      if (row) {
        let storeId = storeIds.get(row.store.slug);
        if (storeId === undefined) {
          storeId = await upsertStore(db, row.store);
          storeIds.set(row.store.slug, storeId);
        }
        await upsertCoupon(db, storeId, row);
        upserted++;
      }
      if (item.id > cursor) cursor = item.id;
    }
    await setState(db, 'nichedb:deals:after', String(cursor));
    more = items.length >= PAGE_SIZE;
    if (!more) break;
  }

  return { ok: true, skipped: false, fetched, upserted, stores: storeIds.size, cursor: cursor || null, more };
}
