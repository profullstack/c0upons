/**
 * Pull PeerPush's deals board (https://peerpush.com/deals) into stores and coupons.
 *
 * PeerPush is a launch directory for software products, and its founders can
 * attach a discount to their listing: a code, a title ("20% OFF"), a percent
 * and a valid-until date. The /deals page lists every live one with the code
 * in full (its own FAQ: "Codes are shown in full on this page"), and its
 * robots.txt allows the path and signals `ai-input=yes`.
 *
 * WHERE THE DATA IS
 *
 * The page is a Next.js app router render. Its JSON-LD names the products but
 * not the codes; the codes ride in the React Server Components payload, the
 * `self.__next_f.push([1, "..."])` script chunks. Joined in order, those
 * chunks hold each product as a plain JSON object starting
 * `{"id":"<cuid>","slug":"...","name":"..."` with `discountCode`,
 * `discountTitle`, `discountPercent`, `discountValidUntil` and
 * `discountCreatedAt` on it. This module finds every such object by brace
 * matching (string-aware, so a `{` in a description does not throw it off)
 * and keeps the ones that carry a deal.
 *
 * RSC escapes a few values: a string starting `$$` is a literal `$` ("$$20
 * OFF" is "$20 OFF"), `$D<iso>` is a Date, `$undefined` is undefined, and any
 * other `$<id>` is a reference to another chunk (long descriptions are sent
 * that way), which this reads as absent and falls back to the tagline.
 *
 * `?page=2` is ignored by PeerPush (same list); the `type=big|ending|free`
 * views can surface deals the default view does not, so a run reads all four
 * and dedupes by product id.
 *
 * A row is `(source 'peerpush', source_id <product id>)`: one deal per
 * product, updated in place when the founder changes it. Expired rows are
 * deleted the way the Flipp sync does, except ones a bounty points at.
 *
 * Scheduled daily by the scraper daemon (lib/daemon.ts); POST
 * /api/sync/peerpush runs it by hand. No framework imports on purpose:
 * `test/peerpush-sync.test.mjs` runs it under plain Node.
 */

import {
  dateOnly,
  displayName,
  ensureSyncSchema,
  formatDiscount,
  getState,
  setState,
  upsertCoupon,
  upsertStore,
  type CouponRow,
  type SqlDb,
} from './nichedb-sync.ts';
import { codeFromUrl, hostOf, parseDiscount, slugify } from './reddit-sync.ts';

export const SOURCE = 'peerpush';
export const DEALS_URL = 'https://peerpush.com/deals';
export const DEAL_VIEWS = ['', '?type=big', '?type=ending', '?type=free'];
export const MIN_MINUTES_BETWEEN_RUNS = 60;
export const USER_AGENT = 'c0upons/1.10 (+https://c0upons.com; reads peerpush.com/deals daily)';

/** The fields of a PeerPush product this sync reads. */
export interface PeerpushDeal {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  category: string | null;
  discountCode: string | null;
  discountTitle: string | null;
  discountPercent: number | null;
  discountValidUntil: string | null;
  discountCreatedAt: string | null;
}

/** The RSC payload of a page: every `self.__next_f.push([1,"..."])` string, decoded and joined. */
export function flightText(html: string): string {
  const out: string[] = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1]) as string);
    } catch {
      /* a chunk that is not a JSON string: skip it */
    }
  }
  return out.join('');
}

/** The balanced JSON object starting at `start` (a `{`), or null. */
function objectAt(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** An RSC-encoded value as the plain string it stands for, or null. */
export function rscString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (v.startsWith('$$')) return v.slice(1);
  if (v.startsWith('$D')) return v.slice(2);
  if (v.startsWith('$')) return null; // $undefined, or a reference to another chunk
  return v;
}

/** Trim, drop wrapping quotes a founder typed ("\"10% OFF\""), collapse whitespace. */
function clean(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, ' ').trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  return t || null;
}

/** Every product on the page that carries a deal, in page order, one per product id. */
export function extractDeals(html: string): PeerpushDeal[] {
  const text = flightText(html);
  const seen = new Set<string>();
  const out: PeerpushDeal[] = [];
  const re = /\{"id":"[a-z0-9]{20,32}","slug":"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = objectAt(text, m.index);
    if (!raw || !raw.includes('"discount')) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(raw);
    } catch {
      continue;
    }
    const id = String(o.id);
    const code = clean(rscString(o.discountCode));
    const title = clean(rscString(o.discountTitle));
    if (seen.has(id) || (!code && !title)) continue;
    const name = clean(rscString(o.name));
    if (!name) continue;
    seen.add(id);
    const logo = o.logo && typeof o.logo === 'object' ? rscString((o.logo as { url?: unknown }).url) : null;
    const cats = Array.isArray(o.categories) ? (o.categories as Array<{ name?: unknown }>) : [];
    const pct = typeof o.discountPercent === 'number' && o.discountPercent > 0 ? o.discountPercent : null;
    out.push({
      id,
      slug: String(o.slug),
      name,
      tagline: clean(rscString(o.tagline)),
      websiteUrl: clean(rscString(o.websiteUrl)),
      logoUrl: logo,
      category: cats.length ? clean(rscString(cats[0].name)) : null,
      discountCode: code,
      discountTitle: title,
      discountPercent: pct,
      discountValidUntil: rscString(o.discountValidUntil),
      discountCreatedAt: rscString(o.discountCreatedAt),
    });
  }
  return out;
}

/** "https://x.com/?utm_source=peerpush&ref=1" -> "https://x.com/?ref=1": tracking off, the rest kept. */
export function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

/** A founder-typed code: no placeholder ("-", "n/a"), no sentence. A link is handled by the caller. */
function plausibleCode(s: string): boolean {
  if (/^(-+|n\/?a|none|no code|null)$/i.test(s)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,39}$/.test(s) && s.split(' ').length <= 3;
}

const APP_STORES = /(^|\.)(apps\.apple\.com|apps\.microsoft\.com|play\.google\.com|chromewebstore\.google\.com|chrome\.google\.com)$/i;

/** `code=PEERPUSH` on an App Store offer-code redeem link. */
function codeParam(url: string): string | null {
  try {
    const v = new URL(url).searchParams.get('code');
    return v && plausibleCode(v) ? v : null;
  } catch {
    return null;
  }
}

/** One deal to one coupon row with its store. */
export function toCouponRow(deal: PeerpushDeal): CouponRow | null {
  const site = deal.websiteUrl && /^https?:\/\//i.test(deal.websiteUrl) ? stripTracking(deal.websiteUrl) : null;
  // An App Store / Microsoft Store / Play listing is the link, not the store's own website.
  const host = site && !APP_STORES.test(hostOf(site) ?? '') ? hostOf(site) : null;
  // A founder sometimes enters a redeem link where the code goes (App Store offer codes, a ref link).
  let code: string | null = null;
  let link = site;
  if (deal.discountCode && /^https?:\/\//i.test(deal.discountCode)) {
    link = deal.discountCode;
    code = codeFromUrl(deal.discountCode) ?? codeParam(deal.discountCode);
  } else if (deal.discountCode && plausibleCode(deal.discountCode)) {
    code = deal.discountCode;
  }
  const offer = deal.discountTitle ?? (deal.discountPercent ? `${deal.discountPercent}% off` : null);
  if (!offer && !code) return null;

  const slug = slugify(deal.name);
  if (!slug) return null;
  const parsed = parseDiscount(offer);
  // PeerPush computes discountPercent for every deal ("$20 OFF" arrives as 25), so the
  // founder's own words win and the percent is only the fallback.
  // A price ("$0.99/Month") is not a percent off, whatever PeerPush computed.
  const usePct = !parsed.type && deal.discountPercent != null && !/\$/.test(offer ?? '');
  const type = parsed.type ?? (usePct ? 'percent' : null);
  const value = parsed.type ? parsed.value : usePct ? deal.discountPercent : null;
  const title = offer ? `${deal.name}: ${offer}` : `${deal.name} discount code`;
  const description = [deal.tagline, deal.category ? `Category: ${deal.category}.` : null, 'Listed by the founder on PeerPush.']
    .filter(Boolean)
    .join(' ');

  return {
    store: {
      name: displayName(deal.name, slug),
      slug,
      website: host ? `https://${host}` : null,
      logo_url: deal.logoUrl ?? (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=128` : null),
    },
    source: SOURCE,
    source_id: deal.id,
    code,
    title: title.slice(0, 300),
    description: description.slice(0, 2000),
    discount: formatDiscount(type, value),
    discount_type: type,
    discount_value: value,
    expiry_date: dateOnly(deal.discountValidUntil),
    url: link ?? `https://peerpush.com/p/${deal.slug}`,
    image_url: deal.logoUrl,
    created_at: deal.discountCreatedAt,
  };
}

/* ------------------------------------------------------------------------ */

/** How the sync reads a page: plain fetch by default, the daemon's polite fetcher when it runs there. */
export type FetchText = (url: string) => Promise<string>;

export function plainFetchText(doFetch: typeof fetch = fetch): FetchText {
  return async (url) => {
    const res = await doFetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' } });
    if (!res.ok) throw new Error(`peerpush answered ${res.status} for ${url}`);
    return res.text();
  };
}

export interface PeerpushSyncOptions {
  baseUrl?: string;
  fetchText?: FetchText;
  /** The throttle the public route gets; the daemon passes 0 (it schedules itself). */
  minMinutesBetweenRuns?: number;
  now?: () => Date;
}

export interface PeerpushSyncResult {
  ok: true;
  skipped: boolean;
  reason?: string;
  pages: number;
  deals: number;
  inserted: number;
  updated: number;
  declined: number;
  pruned: number;
  stores: number;
  /** Titles of the deals this run saw for the first time. */
  added: string[];
}

/**
 * One run: read the four deal views, write every deal, prune the expired.
 * A view that fails is skipped as long as one answered; none answering throws.
 */
export async function syncPeerpushDeals(db: SqlDb, opts: PeerpushSyncOptions = {}): Promise<PeerpushSyncResult> {
  const base = opts.baseUrl ?? process.env.PEERPUSH_DEALS_URL ?? DEALS_URL;
  const fetchText = opts.fetchText ?? plainFetchText();
  const minMinutes = opts.minMinutesBetweenRuns ?? MIN_MINUTES_BETWEEN_RUNS;
  const now = opts.now ?? (() => new Date());
  const empty = { pages: 0, deals: 0, inserted: 0, updated: 0, declined: 0, pruned: 0, stores: 0, added: [] };

  await ensureSyncSchema(db);
  const lastRun = await getState(db, 'peerpush:last_run');
  if (minMinutes > 0 && lastRun && now().getTime() - new Date(lastRun).getTime() < minMinutes * 60_000) {
    return { ok: true, skipped: true, reason: 'ran recently', ...empty };
  }
  await setState(db, 'peerpush:last_run', now().toISOString());

  const deals = new Map<string, PeerpushDeal>();
  let pages = 0;
  let lastError: unknown = null;
  for (const view of DEAL_VIEWS) {
    try {
      const html = await fetchText(base + view);
      pages++;
      for (const d of extractDeals(html)) if (!deals.has(d.id)) deals.set(d.id, d);
    } catch (err) {
      lastError = err;
    }
  }
  if (!pages) throw lastError instanceof Error ? lastError : new Error('no peerpush deal page answered');

  const today = now().toISOString().slice(0, 10);
  const storeIds = new Map<string, number>();
  const added: string[] = [];
  let inserted = 0;
  let updated = 0;
  let declined = 0;
  for (const deal of deals.values()) {
    const row = toCouponRow(deal);
    if (!row || (row.expiry_date && row.expiry_date < today)) {
      declined++;
      continue;
    }
    let storeId = storeIds.get(row.store.slug);
    if (storeId === undefined) {
      storeId = await upsertStore(db, row.store);
      storeIds.set(row.store.slug, storeId);
    }
    const existing = await db.sql`SELECT id FROM coupons WHERE source = ${SOURCE} AND source_id = ${row.source_id} LIMIT 1`;
    await upsertCoupon(db, storeId, row);
    if (existing.length) updated++;
    else {
      inserted++;
      added.push(row.title);
    }
  }

  // Past their valid-until date: gone, unless a bounty points at the row (no ON DELETE there).
  const expired = await db.sql`
    SELECT id FROM coupons
    WHERE source = ${SOURCE} AND expiry_date IS NOT NULL AND expiry_date <> '' AND expiry_date < ${today}
      AND id NOT IN (SELECT coupon_id FROM bounties WHERE coupon_id IS NOT NULL)
  `;
  for (const r of expired) await db.sql`DELETE FROM coupons WHERE id = ${r.id}`;
  await setState(db, 'peerpush:last_counts', JSON.stringify({ deals: deals.size, inserted, updated, at: now().toISOString() }));

  return {
    ok: true,
    skipped: false,
    pages,
    deals: deals.size,
    inserted,
    updated,
    declined,
    pruned: expired.length,
    stores: storeIds.size,
    added,
  };
}
