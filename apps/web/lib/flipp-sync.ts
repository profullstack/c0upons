/**
 * Pull the week's grocery circulars into stores and coupons.
 *
 * A grocery chain's best prices are in its weekly ad: $0.99 avocados, $1.99
 * eggs, "buy 4 or more" sodas. They are not codes, but they are exactly what
 * someone opening c0upons.com/stores/raleys wants to see, and every chain
 * publishes one. Flipp (backflipp.wishabi.com) is the aggregator most US
 * grocers hand their circular to, and its JSON is public and keyless: a
 * postal code lists the flyers valid there, and a flyer id lists its items
 * with price, image and validity.
 *
 * WHAT ONE RUN DOES
 *
 * 1. Drops our own weekly-ad rows whose week is over (a last-week price is
 *    wrong, not merely old), unless a bounty points at the row.
 * 2. Every few hours, rebuilds the queue: the flyers in the Groceries and
 *    Pharmacy categories for a spread of metro postal codes, one flyer per
 *    chain and flyer name, so Walmart's circular is read once and not once
 *    per city while regional chains (Raley's, H-E-B, Publix) still appear.
 * 3. Reads the next few flyers nobody has read yet and writes their items.
 *    A flyer is a few hundred rows, so a run takes six and the poller comes
 *    back every five minutes for the rest: the whole country in about two
 *    and a half hours. The first postal code's metro (Sacramento, where
 *    Raley's lives) is read first, then the rest in list order, so a store
 *    page someone was just sent to exists within minutes, not hours.
 *
 * WHERE THE UNIT COMES FROM
 *
 * The flyer endpoint gives "0.97" for a whole chicken and leaves out that it
 * is per pound. Flipp's item search has the unit, the "BUY 4 OR MORE" and the
 * "MEMBER PRICE", but caps at 150 results and misses some chains entirely,
 * so the flyer is the list and the search, keyed by the same item id, only
 * adds the words where it has them.
 *
 * A row is `(source 'flipp', source_id '<flipp item id>')`. It has no code,
 * so the reveal sweep and the coupon page's reveal button skip this source:
 * there is nothing hidden on a circular for a browser to find.
 *
 * No framework imports on purpose: `test/flipp-sync.test.mjs` runs this under
 * plain Node against a local libSQL file with a fake Flipp.
 */

import {
  dateOnly, ensureSyncSchema, getState, setState, upsertCoupon, upsertStore,
  type CouponRow, type SqlDb, type StoreRow,
} from './nichedb-sync.ts';

export const SOURCE = 'flipp';
export const API_URL = 'https://backflipp.wishabi.com/flipp';
export const USER_AGENT = 'c0upons/1.8 (+https://c0upons.com; reads weekly grocery ads)';
export const MIN_MINUTES_BETWEEN_RUNS = 4;
export const MAX_FLYERS_PER_RUN = 6;
export const QUEUE_TTL_HOURS = 6;
export const CATEGORIES = ['Groceries', 'Pharmacy'];

/**
 * One downtown postal code per large metro. Raley's is Sacramento's, H-E-B
 * Texas', Publix Florida's and Georgia's, Wegmans and ShopRite the
 * Northeast's: a chain only shows up where it trades.
 */
export const POSTAL_CODES = [
  '95814', // Sacramento
  '95112', // San Jose
  '94103', // San Francisco
  '90012', // Los Angeles
  '92101', // San Diego
  '98101', // Seattle
  '97204', // Portland
  '85004', // Phoenix
  '80202', // Denver
  '75201', // Dallas
  '77002', // Houston
  '60601', // Chicago
  '48226', // Detroit
  '55401', // Minneapolis
  '30303', // Atlanta
  '33130', // Miami
  '28202', // Charlotte
  '10001', // New York
  '02108', // Boston
  '19107', // Philadelphia
];

/**
 * The chain's own site, where a shopper can clip the offer or check a store.
 * Keys are store slugs. A chain missing here links to its flyer on Flipp.
 */
export const STORE_SITES: Record<string, string> = {
  'raleys': 'raleys.com', 'bel-air': 'belair.raleys.com', 'nob-hill-foods': 'nobhill.raleys.com',
  'safeway': 'safeway.com', 'albertsons': 'albertsons.com', 'vons': 'vons.com', 'pavilions': 'pavilions.com',
  'jewel-osco': 'jewelosco.com', 'acme-markets': 'acmemarkets.com', 'shaws': 'shaws.com', 'tom-thumb': 'tomthumb.com',
  'randalls': 'randalls.com', 'kroger': 'kroger.com', 'ralphs': 'ralphs.com', 'fred-meyer': 'fredmeyer.com',
  'king-soopers': 'kingsoopers.com', 'qfc': 'qfc.com', 'foods-co': 'foodsco.net', 'food-4-less': 'food4less.com',
  'harris-teeter': 'harristeeter.com', 'smiths': 'smithsfoodanddrug.com', 'frys-food-stores': 'frysfood.com',
  'walmart': 'walmart.com', 'target': 'target.com', 'costco': 'costco.com', 'sams-club': 'samsclub.com',
  'bjs-wholesale-club': 'bjs.com', 'save-mart': 'savemart.com', 'foodmaxx': 'foodmaxx.com', 'lucky': 'luckysupermarkets.com',
  'grocery-outlet': 'groceryoutlet.com', 'smart-and-final': 'smartandfinal.com', 'sprouts-farmers-market': 'sprouts.com',
  'whole-foods-market': 'wholefoodsmarket.com', 'trader-joes': 'traderjoes.com', 'aldi': 'aldi.us', 'lidl': 'lidl.com',
  'publix': 'publix.com', 'h-e-b': 'heb.com', 'heb': 'heb.com', 'meijer': 'meijer.com', 'wegmans': 'wegmans.com',
  'shoprite': 'shoprite.com', 'stop-and-shop': 'stopandshop.com', 'giant': 'giantfood.com', 'giant-food': 'giantfood.com',
  'food-lion': 'foodlion.com', 'hannaford': 'hannaford.com', 'winn-dixie': 'winndixie.com', 'stater-bros-markets': 'staterbros.com',
  'winco-foods': 'wincofoods.com', 'dollar-general': 'dollargeneral.com', 'family-dollar': 'familydollar.com',
  'cvs-pharmacy': 'cvs.com', 'cvs': 'cvs.com', 'walgreens': 'walgreens.com', 'rite-aid': 'riteaid.com',
  'restaurant-depot': 'restaurantdepot.com', '99-ranch-market': '99ranch.com', 'cardenas-markets': 'cardenasmarkets.com',
  'vallarta-supermarkets': 'vallartasupermarkets.com', 'northgate-market': 'northgatemarket.com',
};

/** One flyer from `/flyers?postal_code=`, as much as the sync reads. */
export interface FlippFlyer {
  id: number;
  merchant: string;
  merchant_id: number;
  merchant_logo?: string | null;
  name?: string | null;
  categories_csv?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  postal_code?: string | null;
}

/** One item from `/flyers/<id>`. */
export interface FlippItem {
  id: number;
  flyer_id?: number;
  name?: string | null;
  brand?: string | null;
  price?: string | number | null;
  cutout_image_url?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
}

/** The words the item search adds, keyed by the same id. */
export interface FlippExtra {
  pre_price_text?: string | null;
  post_price_text?: string | null;
  sale_story?: string | null;
  original_price?: string | number | null;
}

/** A flyer waiting to be read, as the queue in sync_state keeps it. */
export interface QueuedFlyer {
  id: number;
  merchant: string;
  merchant_id: number;
  logo: string | null;
  postal_code: string;
  valid_to: string | null;
}

/** "Raley's" -> "raleys", "Smart & Final" -> "smart-and-final", matching the slugs the site already has. */
export function storeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function https(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, 'https://');
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tidy(s: string | null | undefined): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
}

/** "MEMBER PRICE. 3 Days Only!" reads better as "Member price. 3 days only!". */
function sentenceCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  const lower = s.toLowerCase();
  return lower.replace(/(^|[.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

/**
 * The badge: "$0.97/lb", "$1.99 ea", "$17.99". The rest of the post-price
 * text ("+CRV CA only", "Single Item $2.00 ea") goes to the description.
 */
export function priceLabel(price: number, post: string | null | undefined): { label: string; rest: string | null } {
  return priceLabelWith(price, null, post);
}

/** Target's "2/" before the price means "2 for": "$10.00" is the price of two. */
function multiBuy(pre: string | null | undefined): number | null {
  const m = /^(\d{1,2})\s*(?:\/|for)\s*$/i.exec(tidy(pre) ?? '');
  return m && Number(m[1]) > 1 ? Number(m[1]) : null;
}

/** The badge with a "2/" prefix folded in: "2 for $10.00". */
export function priceLabelWith(
  price: number,
  pre: string | null | undefined,
  post: string | null | undefined
): { label: string; rest: string | null } {
  const n = multiBuy(pre);
  const dollars = n ? `${n} for $${price.toFixed(2)}` : `$${price.toFixed(2)}`;
  const text = tidy(post);
  if (!text) return { label: dollars, rest: null };
  const m = /^(lb|lbs|ea\.?|each|oz|\/lb|per lb)\b\.?\s*/i.exec(text);
  if (!m) return { label: dollars, rest: text };
  const unit = m[1].toLowerCase().replace(/^\/|^per\s+/, '').replace(/\.$/, '');
  const label = unit === 'lb' || unit === 'lbs' ? `${dollars}/lb` : unit === 'oz' ? `${dollars}/oz` : `${dollars} ea`;
  return { label, rest: tidy(text.slice(m[0].length)) };
}

function shortDate(iso: string | null | undefined): string | null {
  const d = dateOnly(iso ?? null);
  if (!d) return null;
  const [y, mo, da] = d.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1];
  return month && y ? `${month} ${da}` : null;
}

/** The store a flyer belongs to, with its own site when we know it. */
export function flyerStore(flyer: Pick<QueuedFlyer, 'merchant' | 'logo'>): StoreRow {
  const name = flyer.merchant.trim();
  const slug = storeSlug(name);
  const site = STORE_SITES[slug];
  return {
    name,
    slug,
    website: site ? `https://${site}` : null,
    logo_url: https(flyer.logo) ?? (site ? `https://www.google.com/s2/favicons?domain=${site}&sz=128` : null),
  };
}

/**
 * One flyer item to one coupon row, or null for a page element that is not
 * a priced product (a banner, a "see store for details" tile).
 */
export function toCouponRow(item: FlippItem, flyer: QueuedFlyer, extra: FlippExtra | null = null): CouponRow | null {
  const name = tidy(item.name);
  const price = num(item.price);
  if (!name || !price || !item.id) return null;

  const store = flyerStore(flyer);
  const { label, rest } = priceLabelWith(price, extra?.pre_price_text, extra?.post_price_text);
  const pre = multiBuy(extra?.pre_price_text) ? null : tidy(extra?.pre_price_text);
  const original = num(extra?.original_price);
  const saving = original && original > price ? Math.round((original - price) * 100) / 100 : null;

  const from = shortDate(item.valid_from ?? null);
  const to = shortDate(item.valid_to ?? flyer.valid_to);
  const notes = [
    pre,
    tidy(extra?.sale_story),
    rest,
    original && saving ? `Regular $${original.toFixed(2)}, you save $${saving.toFixed(2)}.` : null,
  ]
    .filter((s): s is string => Boolean(s))
    .map((s) => sentenceCase(s).replace(/([^.!?])$/, '$1.'));
  const valid = from && to ? `valid ${from} to ${to}` : to ? `valid through ${to}` : null;
  notes.push(`${store.name} weekly ad price${valid ? `, ${valid}` : ''}. Prices and availability vary by location.`);

  const created = item.valid_from ? new Date(item.valid_from) : null;
  return {
    store,
    source: SOURCE,
    source_id: String(item.id),
    code: null,
    title: name.slice(0, 300),
    description: notes.join(' ').slice(0, 2000),
    discount: label,
    discount_type: saving ? 'fixed' : null,
    discount_value: saving,
    expiry_date: dateOnly(item.valid_to ?? flyer.valid_to),
    url: store.website ?? `https://flipp.com/en-us/weekly_ad/${flyer.id}`,
    image_url: https(item.cutout_image_url),
    created_at: created && !Number.isNaN(created.getTime()) ? created.toISOString() : null,
  };
}

async function getJson<T>(doFetch: typeof fetch, url: string): Promise<T> {
  const res = await doFetch(url, { headers: { accept: 'application/json', 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`flipp answered ${res.status} for ${url}`);
  return (await res.json()) as T;
}

/** Home metro first (the postal codes' own order), soonest-expiring first within a metro. */
export function readOrder(postalCodes: string[]): (a: QueuedFlyer, b: QueuedFlyer) => number {
  const rank = (zip: string) => {
    const i = postalCodes.indexOf(zip);
    return i < 0 ? postalCodes.length : i;
  };
  return (a, b) =>
    rank(a.postal_code) - rank(b.postal_code) || (a.valid_to ?? '9999').localeCompare(b.valid_to ?? '9999');
}

/**
 * The grocery flyers valid now across the postal codes, one per chain and
 * flyer name, first postal code wins, in postal-code order and soonest
 * expiring first within one.
 */
export async function listFlyers(
  doFetch: typeof fetch,
  opts: { apiUrl: string; postalCodes: string[]; categories: string[]; now: Date }
): Promise<QueuedFlyer[]> {
  const seen = new Set<string>();
  const out: QueuedFlyer[] = [];
  for (const zip of opts.postalCodes) {
    let flyers: FlippFlyer[] = [];
    try {
      const body = await getJson<{ flyers?: FlippFlyer[] }>(doFetch, `${opts.apiUrl}/flyers?locale=en-us&postal_code=${encodeURIComponent(zip)}`);
      flyers = Array.isArray(body.flyers) ? body.flyers : [];
    } catch (err) {
      console.error(`[flipp] flyers for ${zip} failed:`, (err as Error).message);
      continue;
    }
    for (const f of flyers) {
      if (!f?.id || !f.merchant) continue;
      const cats = (f.categories_csv ?? '').split(',').map((c) => c.trim());
      if (!opts.categories.some((c) => cats.includes(c))) continue;
      if (f.valid_to && new Date(f.valid_to).getTime() < opts.now.getTime()) continue;
      const key = `${f.merchant_id}:${(f.name ?? '').trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: f.id,
        merchant: f.merchant.trim(),
        merchant_id: f.merchant_id,
        logo: f.merchant_logo ?? null,
        postal_code: zip,
        valid_to: f.valid_to ?? null,
      });
    }
  }
  out.sort(readOrder(opts.postalCodes));
  return out;
}

/** The words the search has for a chain's items at a postal code, by item id. Best effort. */
async function searchExtras(doFetch: typeof fetch, apiUrl: string, flyer: QueuedFlyer): Promise<Map<number, FlippExtra>> {
  const out = new Map<number, FlippExtra>();
  try {
    const q = new URLSearchParams({ locale: 'en-us', postal_code: flyer.postal_code, q: flyer.merchant });
    const body = await getJson<{ items?: Array<FlippExtra & { flyer_item_id?: number; id?: number; flyer_id?: number }> }>(
      doFetch,
      `${apiUrl}/items/search?${q}`
    );
    for (const it of body.items ?? []) {
      const id = it.flyer_item_id ?? it.id;
      if (id && it.flyer_id === flyer.id) out.set(id, it);
    }
  } catch (err) {
    console.error(`[flipp] search for ${flyer.merchant} failed:`, (err as Error).message);
  }
  return out;
}

export interface FlippSyncOptions {
  apiUrl?: string;
  postalCodes?: string[];
  categories?: string[];
  maxFlyers?: number;
  /** Stop starting new flyers after this long. */
  maxMs?: number;
  minMinutesBetweenRuns?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface FlippSyncResult {
  ok: true;
  skipped: boolean;
  reason?: string;
  listed: number;
  remaining: number;
  pruned: number;
  written: number;
  flyers: Array<{ id: number; store: string; postal_code: string; items: number; written: number }>;
}

function envList(name: string): string[] | null {
  const raw = process.env[name];
  if (!raw) return null;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

/** Remove weekly-ad rows whose week has ended, keeping any a bounty points at. */
async function pruneExpired(db: SqlDb, today: string): Promise<number> {
  const [{ n }] = await db.sql`
    SELECT COUNT(*) AS n FROM coupons
    WHERE source = ${SOURCE} AND expiry_date IS NOT NULL AND expiry_date < ${today}
      AND id NOT IN (SELECT coupon_id FROM bounties WHERE coupon_id IS NOT NULL)
  `;
  if (Number(n) > 0) {
    await db.sql`
      DELETE FROM coupons
      WHERE source = ${SOURCE} AND expiry_date IS NOT NULL AND expiry_date < ${today}
        AND id NOT IN (SELECT coupon_id FROM bounties WHERE coupon_id IS NOT NULL)
    `;
  }
  return Number(n);
}

/**
 * One run: prune last week, refresh the queue when it is stale, read the
 * next few unread flyers. Throttled like the other syncs so the public
 * trigger cannot make Flipp pay for a stranger's curiosity.
 */
export async function syncFlippWeeklyAds(db: SqlDb, opts: FlippSyncOptions = {}): Promise<FlippSyncResult> {
  const apiUrl = (opts.apiUrl ?? process.env.FLIPP_API_URL ?? API_URL).replace(/\/$/, '');
  const postalCodes = opts.postalCodes ?? envList('FLIPP_POSTAL_CODES') ?? POSTAL_CODES;
  const categories = opts.categories ?? envList('FLIPP_CATEGORIES') ?? CATEGORIES;
  const maxFlyers = opts.maxFlyers ?? MAX_FLYERS_PER_RUN;
  const maxMs = opts.maxMs ?? 35_000;
  const minMinutes = opts.minMinutesBetweenRuns ?? MIN_MINUTES_BETWEEN_RUNS;
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? (() => new Date());

  await ensureSyncSchema(db);

  const lastRun = await getState(db, 'flipp:last_run');
  if (lastRun && now().getTime() - new Date(lastRun).getTime() < minMinutes * 60_000) {
    return { ok: true, skipped: true, reason: 'ran recently', listed: 0, remaining: 0, pruned: 0, written: 0, flyers: [] };
  }
  await setState(db, 'flipp:last_run', now().toISOString());

  const pruned = await pruneExpired(db, now().toISOString().slice(0, 10));

  let queue: QueuedFlyer[] | null = null;
  const builtAt = await getState(db, 'flipp:queue_built_at');
  if (builtAt && now().getTime() - new Date(builtAt).getTime() < QUEUE_TTL_HOURS * 3_600_000) {
    try {
      queue = JSON.parse((await getState(db, 'flipp:queue')) ?? 'null');
    } catch {
      queue = null;
    }
  }
  if (!Array.isArray(queue)) {
    queue = await listFlyers(doFetch, { apiUrl, postalCodes, categories, now: now() });
    await setState(db, 'flipp:queue', JSON.stringify(queue));
    await setState(db, 'flipp:queue_built_at', now().toISOString());
    // A flyer's marker only matters while the flyer is listed; weeks-old ones are clutter.
    const stale = new Date(now().getTime() - 30 * 86_400_000).toISOString();
    await db.sql`DELETE FROM sync_state WHERE key LIKE 'flipp:done:%' AND value < ${stale}`;
  }

  const doneRows = (await db.sql`SELECT key FROM sync_state WHERE key LIKE 'flipp:done:%'`) as Array<{ key: string }>;
  const done = new Set(doneRows.map((r) => Number(String(r.key).slice('flipp:done:'.length))));
  // Sorted here as well as when built, so a queue saved under an older order still reads home first.
  const pending = queue.filter((f) => !done.has(f.id)).sort(readOrder(postalCodes));

  const flyers: FlippSyncResult['flyers'] = [];
  let written = 0;
  // A flyer is a few hundred remote writes; stop starting new ones in time
  // for the route to answer inside its 60-second limit.
  const started = Date.now();
  for (const flyer of pending.slice(0, maxFlyers)) {
    if (flyers.length && Date.now() - started > maxMs) break;
    const body = await getJson<{ items?: FlippItem[] }>(doFetch, `${apiUrl}/flyers/${flyer.id}?locale=en-us`);
    const items = Array.isArray(body.items) ? body.items : [];
    const extras = await searchExtras(doFetch, apiUrl, flyer);
    const store = flyerStore(flyer);
    const storeId = await upsertStore(db, store);
    let n = 0;
    for (const item of items) {
      const row = toCouponRow(item, flyer, extras.get(item.id) ?? null);
      if (!row) continue;
      await upsertCoupon(db, storeId, row);
      n++;
    }
    await setState(db, `flipp:done:${flyer.id}`, now().toISOString());
    flyers.push({ id: flyer.id, store: store.name, postal_code: flyer.postal_code, items: items.length, written: n });
    written += n;
  }

  return {
    ok: true,
    skipped: false,
    listed: queue.length,
    remaining: Math.max(0, pending.length - flyers.length),
    pruned,
    written,
    flyers,
  };
}
