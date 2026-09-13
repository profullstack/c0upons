/**
 * Pull r/couponcodes into stores and coupons.
 *
 * The subreddit is where people paste the code they were just given: a
 * referral link, a "use code X at checkout", a voucher batch. Its Atom feed
 * (`/r/couponcodes/new.rss`) is public and needs no key, so this module reads
 * it, turns each post that actually carries a deal into a coupon row under a
 * store it names, and lets the poller call it every few minutes for whatever
 * is new.
 *
 * HOW IT REACHES REDDIT
 *
 * Reddit rate-limits datacenter addresses: a plain fetch from Railway or from
 * a dev box answers 429 with an empty body, feed or not. The Obscura relay
 * (a stealth browser behind an MCP `fetch_page` tool) is not rate-limited the
 * same way, so a run tries the feed directly first and, when Reddit refuses
 * or answers with something that is not a feed, asks the relay for the
 * original bytes. Which path answered is reported as `via`.
 *
 * WHAT IT TAKES AND WHAT IT DECLINES
 *
 * A post is a listing when it carries a code or links out to the store; a
 * post that asks for a code, or only talks, is conversation and is skipped.
 * A post that links back to c0upons.com is our own coupon coming round again
 * and is skipped too, or the site would echo itself. The store is read from
 * the title ("$10 off at Wonder", "Sideline Swap Coupon Code", "Netcup
 * Voucher Codes") and, failing that, from the host the post links to, unless
 * that host is a link shortener that names nobody.
 *
 * A row is `(source 'reddit', source_id 'couponcodes:<post id>')`, the same
 * pair the nichedb sync uses, so a second read of the same post updates in
 * place. Unlike that sync, a null code never overwrites a code the browser
 * reveal already found for the row.
 *
 * No framework imports on purpose: `test/reddit-sync.test.mjs` runs this
 * under plain Node against a local libSQL file with a fake Reddit and a fake
 * relay.
 */

import { displayName, ensureSyncSchema, formatDiscount, type SqlDb, type StoreRow } from './nichedb-sync.ts';

export const SOURCE = 'reddit';
export const SUBREDDIT = 'couponcodes';
export const FEED_URL = `https://www.reddit.com/r/${SUBREDDIT}/new.rss?limit=25`;
export const RELAY_URL = 'https://obscura.openmcp.logicsrc.com/mcp';
export const MIN_MINUTES_BETWEEN_RUNS = 4;
export const USER_AGENT = 'c0upons/1.7 (+https://c0upons.com; reads r/couponcodes for new listings)';

/** One `<entry>` of the subreddit's Atom feed, as much of it as the mapping reads. */
export interface FeedEntry {
  id: string;
  title: string;
  link: string;
  updated: string | null;
  author: string | null;
  /** The post body as HTML, entity-decoded once (the feed escapes it). */
  content: string;
}

export interface RedditCouponRow {
  store: StoreRow;
  source: string;
  source_id: string;
  code: string | null;
  title: string;
  description: string | null;
  discount: string | null;
  discount_type: 'percent' | 'fixed' | null;
  discount_value: number | null;
  url: string;
  created_at: string | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decode the handful of entities a Reddit feed uses, numeric ones included. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return m;
  });
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  if (!m) return null;
  const inner = m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1');
  return decodeEntities(inner).trim();
}

/** The entries of an Atom feed, in document order. Tolerant: a broken entry is dropped, not fatal. */
export function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  const re = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const e = m[1];
    const id = tag(e, 'id');
    const title = tag(e, 'title');
    const link = /<link[^>]*\shref="([^"]+)"/i.exec(e)?.[1];
    if (!id || !title || !link) continue;
    out.push({
      id,
      title,
      link: decodeEntities(link),
      updated: tag(e, 'updated') ?? tag(e, 'published'),
      author: /<author>[\s\S]*?<name>([\s\S]*?)<\/name>/i.exec(e)?.[1]?.trim() ?? null,
      content: tag(e, 'content') ?? '',
    });
  }
  return out;
}

/** Post HTML to the plain text a description can hold, minus Reddit's own footer. */
export function bodyText(html: string): string {
  const text = decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '));
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*submitted by\s+\/u\/\S+.*$/i, '')
    .replace(/\s*\[link\]\s*\[comments\]\s*$/i, '')
    .trim();
}

const REDDIT_HOSTS = /(^|\.)(reddit\.com|redd\.it|redditmedia\.com|redditstatic\.com)$/i;
const SHORTENERS =
  /(^|\.)(prz\.io|rwrd\.io|bit\.ly|bitly\.com|tinyurl\.com|t\.co|goo\.gl|shorturl\.at|cutt\.ly|rebrand\.ly|lnk\.to|linktr\.ee|refer\.[a-z]+|referral\.[a-z]+|page\.link|app\.link|onelink\.me|smart\.link|tiny\.cc|is\.gd|ow\.ly)$/i;

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

/** Every link a post makes to somewhere other than Reddit, in order, without duplicates. */
export function externalLinks(entry: FeedEntry): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const hrefs = [...entry.content.matchAll(/href="([^"]+)"/gi)].map((m) => decodeEntities(m[1]));
  const bare = [...bodyText(entry.content).matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map((m) => m[0]);
  for (const raw of [...hrefs, ...bare]) {
    const url = raw.replace(/[.,;:!?)]+$/, '');
    const host = hostOf(url);
    if (!host || REDDIT_HOSTS.test(host) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

const NOT_A_CODE = new Set([
  'for', 'below', 'above', 'here', 'link', 'which', 'that', 'this', 'works', 'valid', 'the', 'and', 'with', 'from',
  'your', 'you', 'get', 'use', 'off', 'free', 'now', 'today', 'when', 'will', 'can', 'each', 'one', 'new', 'first',
  'checkout', 'apply', 'enter', 'expires', 'expired', 'code', 'codes', 'coupon', 'promo', 'referral', 'voucher',
  'into', 'onto', 'then', 'also', 'only', 'more', 'some', 'any', 'all', 'http', 'https', 'www', 'com',
]);

/**
 * The bar the browser reveal sets, loosened for one shape it never meets:
 * letters and digits, not a year or a price (an all-digit code needs six to
 * twelve digits, the way a numeric promo code has them), not a word.
 */
export function isPlausibleCode(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const code = s.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,24}$/.test(code)) return false;
  if (/^\d+$/.test(code) && !/^\d{6,12}$/.test(code)) return false;
  // Letters only and short is a word ("Save", "Get", "Off"), not a code.
  if (!/\d/.test(code) && code.length < 6) return false;
  if (NOT_A_CODE.has(code.toLowerCase())) return false;
  return true;
}

/** The code a post hands out, from "code: X", "use code X", "coupon code X" and the like. */
export function extractCode(...texts: Array<string | null | undefined>): string | null {
  // The token must end where the code ends: "code: https://x" must not yield "http".
  const patterns = [
    /\b(?:promo|coupon|referral|voucher|discount|invite|gift|gutschein)?[\s-]*code\s*(?:is|:|=|-|–)?\s*["'“”‘’`]?([A-Za-z0-9][A-Za-z0-9_-]{2,24})(?![A-Za-z0-9_-]|:\/\/)/gi,
    /\buse\s+(?:the\s+)?(?:code\s+)?["'“”]?([A-Z0-9][A-Z0-9_-]{3,24})["'“”]?(?=\s|$|[.,;!)])/g,
  ];
  for (const text of texts) {
    if (!text) continue;
    for (const re of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (isPlausibleCode(m[1])) return m[1];
      }
    }
  }
  return null;
}

const CODE_PARAMS = /^(promo_?code|auto_applied_promo_code|coupon(_?code)?|apply_?code|discount_?code|voucher(_?code)?|invite(_?code)?|referral(_?code)?|ref_?code|gift_?code)$/i;

/** A code carried in a link's query string, e.g. `?applyCode=TODD-RCA` or `?promoCode=cloudelligent`. */
export function codeFromUrl(url: string): string | null {
  try {
    for (const [k, v] of new URL(url).searchParams) {
      if (CODE_PARAMS.test(k) && isPlausibleCode(v)) return v;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/gi;
const NOISE = /\b(coupon|promo(?:tion(?:al)?)?|referral|voucher|discount|gutschein|codes?|deal|offer|link|free|off|new|20\d\d)\b/gi;

/**
 * A store name is a few words and never starts with a price or a percentage:
 * "YAMI $20-$150 off w/ promo code" is "YAMI", and "20% discount NZ made
 * supplements, site wide" names nobody (the link will).
 */
function cleanStoreName(raw: string): string | null {
  const s = raw
    .replace(/[|:–—-]+$/g, '')
    .replace(MONTHS, ' ')
    .replace(NOISE, ' ')
    .replace(/[^\w\s'&.!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[\s.!-]+$/g, '');
  const words: string[] = [];
  for (const w of s.split(' ')) {
    if (/^[\d$%]/.test(w)) break;
    words.push(w);
  }
  while (words.length && /^(with|for|at|on|in|to|and|using|via|w|of|by)$/i.test(words[words.length - 1])) words.pop();
  if (!words.length || words.length > 4) return null;
  const name = words.join(' ');
  if (name.length < 2 || name.length > 40) return null;
  return name;
}

/** A store name read off the title, or null when the title names nobody. */
export function storeFromTitle(title: string): string | null {
  const t = title.trim();
  const tries: Array<RegExpExecArray | null> = [
    /\b(?:at|from)\s+([A-Z][\w'&.!-]*(?:\s+[A-Z][\w'&.!-]*){0,3})/.exec(t),
    /^(.+?)\s+(?:coupon|promo(?:tion(?:al)?)?|voucher|referral|discount|gutschein)\b/i.exec(t),
    /^\$?\d+(?:\.\d+)?\s*(?:%|\$)?\s*off\s+(?:\$\d+(?:\.\d+)?\s+)?(?:at\s+|on\s+|your\s+(?:first\s+)?(?:order\s+at\s+)?)?(.+?)(?:\s+(?:with|using|when|via|through)\b.*)?$/i.exec(t),
    /^discount\s+(.+)$/i.exec(t),
    /^(.+?)\s*[:|–—-]\s+/.exec(t),
  ];
  for (const m of tries) {
    if (!m) continue;
    const name = cleanStoreName(m[1]);
    if (name) return name;
  }
  return null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The registrable-looking part of a host: "app.wonder.com" -> "wonder.com". */
function siteHost(host: string): string {
  const parts = host.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : host;
}

export function parseDiscount(
  ...texts: Array<string | null | undefined>
): { type: 'percent' | 'fixed' | null; value: number | null } {
  for (const text of texts) {
    if (!text) continue;
    const pct = /(\d{1,2}(?:\.\d+)?)\s*%\s*off/i.exec(text);
    if (pct) return { type: 'percent', value: Number(pct[1]) };
    const usd = /\$\s?(\d+(?:\.\d+)?)\s*off/i.exec(text);
    if (usd) return { type: 'fixed', value: Number(usd[1]) };
  }
  return { type: null, value: null };
}

/**
 * One feed entry to one coupon row with its store, or null when the post is
 * conversation, an echo of our own site, or names no store.
 */
export function toCouponRow(entry: FeedEntry): RedditCouponRow | null {
  const text = bodyText(entry.content);
  const links = externalLinks(entry);
  if (links.some((l) => /(^|\.)c0upons\.com$/i.test(hostOf(l) ?? '')) || /\bc0upons\.com\b/i.test(text)) return null;
  const named = links.filter((l) => !SHORTENERS.test(hostOf(l) ?? ''));
  const code = extractCode(text, entry.title) ?? named.map(codeFromUrl).find(Boolean) ?? null;
  if (!code && !links.length) return null;

  const linkHost = named.length ? hostOf(named[0]) : null;
  const label = linkHost ? siteHost(linkHost).split('.')[0] : null;
  let name = storeFromTitle(entry.title);
  // "Deutscher Starlink" and "Starlink" are one store when the post links to starlink.com.
  if (name && label && slugify(name).replace(/-/g, '').includes(label.toLowerCase())) name = label;
  let slug = name ? slugify(name) : '';
  if (!slug && label) {
    name = label;
    slug = slugify(label);
  }
  if (!name || !slug) return null;

  const discount = parseDiscount(entry.title, text);
  const postId = entry.id.replace(/^t3_/, '');
  return {
    store: {
      name: displayName(name, slug),
      slug,
      website: linkHost ? `https://${siteHost(linkHost)}` : null,
      logo_url: linkHost ? `https://www.google.com/s2/favicons?domain=${siteHost(linkHost)}&sz=128` : null,
    },
    source: SOURCE,
    source_id: `${SUBREDDIT}:${postId}`,
    code,
    title: entry.title.slice(0, 300),
    description: text ? text.slice(0, 2000) : null,
    discount: formatDiscount(discount.type, discount.value),
    discount_type: discount.type,
    discount_value: discount.value,
    url: named[0] ?? links[0] ?? entry.link,
    created_at: entry.updated,
  };
}

/* ------------------------------------------------------------------------ */

async function getState(db: SqlDb, key: string): Promise<string | null> {
  const rows = await db.sql`SELECT value FROM sync_state WHERE key = ${key} LIMIT 1`;
  return rows.length ? (rows[0].value as string | null) : null;
}

async function setState(db: SqlDb, key: string, value: string): Promise<void> {
  await db.sql`
    INSERT INTO sync_state (key, value, updated_at) VALUES (${key}, ${value}, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `;
}

async function upsertStore(db: SqlDb, store: StoreRow): Promise<number> {
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

/** Insert or update one row; says which. A found code is never replaced by a null one. */
async function upsertCoupon(db: SqlDb, storeId: number, row: RedditCouponRow): Promise<'inserted' | 'updated'> {
  const existing = await db.sql`SELECT id FROM coupons WHERE source = ${row.source} AND source_id = ${row.source_id} LIMIT 1`;
  await db.sql`
    INSERT INTO coupons (
      store_id, code, title, description, discount, discount_type, discount_value,
      expiry_date, url, image_url, source, source_id, created_at
    ) VALUES (
      ${storeId}, ${row.code}, ${row.title}, ${row.description}, ${row.discount},
      ${row.discount_type}, ${row.discount_value}, NULL, ${row.url}, NULL,
      ${row.source}, ${row.source_id}, COALESCE(${row.created_at}, CURRENT_TIMESTAMP)
    )
    ON CONFLICT(source, source_id) DO UPDATE SET
      store_id       = excluded.store_id,
      code           = COALESCE(excluded.code, coupons.code),
      title          = excluded.title,
      description    = excluded.description,
      discount       = excluded.discount,
      discount_type  = excluded.discount_type,
      discount_value = excluded.discount_value,
      url            = excluded.url
  `;
  return existing.length ? 'updated' : 'inserted';
}

export interface FetchedFeed {
  xml: string;
  via: 'direct' | 'relay';
}

/**
 * The feed's bytes: straight from Reddit when it lets us, otherwise through
 * the Obscura relay's `fetch_page` with `format: original`.
 */
export async function fetchFeed(
  feedUrl: string,
  opts: { fetch?: typeof fetch; relayUrl?: string | null } = {}
): Promise<FetchedFeed> {
  const doFetch = opts.fetch ?? fetch;
  let status = 0;
  try {
    const res = await doFetch(feedUrl, {
      headers: { accept: 'application/atom+xml, application/xml;q=0.9, */*;q=0.5', 'user-agent': USER_AGENT },
    });
    status = res.status;
    if (res.ok) {
      const xml = await res.text();
      if (/<feed[\s>]/i.test(xml)) return { xml, via: 'direct' };
    }
  } catch {
    status = -1;
  }
  const relay = opts.relayUrl === undefined ? RELAY_URL : opts.relayUrl;
  if (!relay) throw new Error(`reddit answered ${status} for ${feedUrl} and no relay is configured`);
  const res = await doFetch(relay, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'fetch_page',
        arguments: { url: feedUrl, format: 'original', max_chars: 400000, timeout_seconds: 45 },
      },
    }),
  });
  const raw = await res.text();
  const json = raw.trimStart().startsWith('{')
    ? raw
    : raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).pop() ?? '';
  let text = '';
  try {
    const parsed = JSON.parse(json) as {
      result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
      error?: { message?: string };
    };
    if (parsed.error) throw new Error(parsed.error.message ?? 'relay error');
    text = parsed.result?.content?.find((c) => c.type === 'text')?.text ?? '';
    if (parsed.result?.isError) throw new Error(text || 'relay error');
  } catch (err) {
    throw new Error(`reddit answered ${status} and the relay failed: ${(err as Error).message}`);
  }
  if (!/<feed[\s>]/i.test(text)) {
    throw new Error(`reddit answered ${status} and the relay returned no feed (${res.status}, ${text.length} chars)`);
  }
  return { xml: text, via: 'relay' };
}

export interface RedditSyncOptions {
  feedUrl?: string;
  relayUrl?: string | null;
  fetch?: typeof fetch;
  minMinutesBetweenRuns?: number;
  now?: () => Date;
}

export interface RedditSyncResult {
  ok: true;
  skipped: boolean;
  reason?: string;
  via: 'direct' | 'relay' | null;
  fetched: number;
  taken: number;
  inserted: number;
  updated: number;
  declined: number;
  stores: number;
  newest: string | null;
}

/**
 * One run: read the feed, write every post that maps, note the newest id.
 * Throttled so the public trigger and the poller cannot stack runs, and
 * bounded by the feed itself, which is one request of at most 25 posts.
 */
export async function syncRedditCouponcodes(db: SqlDb, opts: RedditSyncOptions = {}): Promise<RedditSyncResult> {
  const feedUrl = opts.feedUrl ?? process.env.REDDIT_COUPONCODES_FEED ?? FEED_URL;
  const relayUrl = opts.relayUrl !== undefined ? opts.relayUrl : (process.env.OBSCURA_RELAY_URL ?? RELAY_URL);
  const minMinutes = opts.minMinutesBetweenRuns ?? MIN_MINUTES_BETWEEN_RUNS;
  const now = opts.now ?? (() => new Date());

  await ensureSyncSchema(db);

  const lastRun = await getState(db, 'reddit:couponcodes:last_run');
  const newestBefore = await getState(db, 'reddit:couponcodes:newest');
  if (lastRun && now().getTime() - new Date(lastRun).getTime() < minMinutes * 60_000) {
    return {
      ok: true, skipped: true, reason: 'ran recently', via: null,
      fetched: 0, taken: 0, inserted: 0, updated: 0, declined: 0, stores: 0, newest: newestBefore,
    };
  }
  await setState(db, 'reddit:couponcodes:last_run', now().toISOString());

  const feed = await fetchFeed(feedUrl, { fetch: opts.fetch, relayUrl });
  const entries = parseFeed(feed.xml);
  const storeIds = new Map<string, number>();
  let inserted = 0;
  let updated = 0;
  let declined = 0;
  for (const entry of entries) {
    const row = toCouponRow(entry);
    if (!row) {
      declined++;
      continue;
    }
    let storeId = storeIds.get(row.store.slug);
    if (storeId === undefined) {
      storeId = await upsertStore(db, row.store);
      storeIds.set(row.store.slug, storeId);
    }
    if ((await upsertCoupon(db, storeId, row)) === 'inserted') inserted++;
    else updated++;
  }
  const newest = entries[0]?.id ?? newestBefore;
  if (newest) await setState(db, 'reddit:couponcodes:newest', newest);

  return {
    ok: true,
    skipped: false,
    via: feed.via,
    fetched: entries.length,
    taken: inserted + updated,
    inserted,
    updated,
    declined,
    stores: storeIds.size,
    newest,
  };
}
