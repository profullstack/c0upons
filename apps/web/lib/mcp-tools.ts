import 'server-only';
import { readFileSync } from 'node:fs';
import { getDb } from './db';
import { loadRootEnv } from './root-env';
import type { McpTool, McpServerInfo } from './mcp-protocol';
import { syncNichedbDeals } from './nichedb-sync';
import { syncRedditCouponcodes } from './reddit-sync';
import { syncFlippWeeklyAds } from './flipp-sync';
import { RECHECK_HOURS, ensureRevealColumns, revealDeps, revealForCoupon, sweepReveals } from './reveal-coupon';

/**
 * What an agent can do with c0upons over MCP: everything the REST API and
 * the CLI can, with the same queries, and nothing that needs a login.
 */

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

export const SERVER: McpServerInfo = {
  name: 'c0upons',
  version,
  instructions:
    'c0upons.com is a community coupon site seeded from nichedb.dev. Use search_coupons or store_coupons to find codes, ' +
    'get_coupon for one, and reveal_code when a coupon has no code: a real browser reads its deal page and clicks what a ' +
    'shopper would (up to a minute). sync_deals pulls new deals in, sync_reddit reads the newest r/couponcodes posts, ' +
    'sync_grocery reads the next grocery weekly ads (Raley\'s, Safeway, Walmart and the rest), and ' +
    'reveal_pending reads a few code-less pages.',
};

const couponFields = 'c.id, c.code, c.title, c.description, c.discount, c.discount_type, c.discount_value, c.expiry_date, c.url, c.votes, c.verified, c.code_checked_at';

export const TOOLS: McpTool[] = [
  {
    name: 'search_coupons',
    description: 'Search coupons by store name, title, description or code. Most voted first, up to 50.',
    inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'What to look for, e.g. "nike" or "free shipping".' } }, required: ['q'], additionalProperties: false },
    async run({ q }) {
      const pattern = `%${String(q).trim()}%`;
      const db = getDb();
      const rows = await db.sql`
        SELECT ${couponFields}, s.name AS store_name, s.slug AS store_slug
        FROM coupons c JOIN stores s ON s.id = c.store_id
        WHERE c.title LIKE ${pattern} OR c.description LIKE ${pattern} OR s.name LIKE ${pattern} OR c.code LIKE ${pattern}
        ORDER BY c.votes DESC LIMIT 50
      `;
      return { count: rows.length, coupons: rows };
    },
  },
  {
    name: 'top_coupons',
    description: 'The most voted coupons across every store.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Default 20.' } }, additionalProperties: false },
    async run({ limit }) {
      const n = Math.min(100, Math.max(1, Number(limit) || 20));
      const rows = await getDb().sql`
        SELECT ${couponFields}, s.name AS store_name, s.slug AS store_slug
        FROM coupons c JOIN stores s ON s.id = c.store_id
        ORDER BY c.votes DESC, c.created_at DESC LIMIT ${n}
      `;
      return { count: rows.length, coupons: rows };
    },
  },
  {
    name: 'list_stores',
    description: 'Every store with how many coupons it has.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      const rows = await getDb().sql`
        SELECT s.id, s.name, s.slug, s.website, COUNT(c.id) AS coupon_count
        FROM stores s LEFT JOIN coupons c ON c.store_id = s.id
        GROUP BY s.id ORDER BY coupon_count DESC, s.name ASC
      `;
      return { count: rows.length, stores: rows };
    },
  },
  {
    name: 'store_coupons',
    description: "One store's coupons, most voted first.",
    inputSchema: { type: 'object', properties: { slug: { type: 'string', description: 'The store slug, e.g. "amazon" or "best-buy".' } }, required: ['slug'], additionalProperties: false },
    async run({ slug }) {
      const db = getDb();
      const stores = await db.sql`SELECT id, name, slug, website FROM stores WHERE slug = ${String(slug)}`;
      if (!stores.length) throw new Error(`No store with slug "${String(slug)}"`);
      const coupons = await db.sql`
        SELECT ${couponFields} FROM coupons c WHERE c.store_id = ${stores[0].id}
        ORDER BY c.votes DESC, c.created_at DESC
      `;
      return { store: stores[0], count: coupons.length, coupons };
    },
  },
  {
    name: 'get_coupon',
    description: 'One coupon by id, with its store.',
    inputSchema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'], additionalProperties: false },
    async run({ id }) {
      const rows = await getDb().sql`
        SELECT ${couponFields}, c.code_source, s.name AS store_name, s.slug AS store_slug, s.website AS store_website
        FROM coupons c JOIN stores s ON s.id = c.store_id WHERE c.id = ${Number(id)}
      `;
      if (!rows.length) throw new Error(`No coupon ${String(id)}`);
      return rows[0];
    },
  },
  {
    name: 'reveal_code',
    description:
      "Read a coupon's deal page with a real browser, dismiss popups, click any show-code or get-deal control, and return the code found (or that there is none). Takes up to a minute. A page read within the last day is not read again.",
    inputSchema: { type: 'object', properties: { id: { type: 'integer', description: 'The coupon id.' } }, required: ['id'], additionalProperties: false },
    async run({ id }) {
      const db = getDb();
      await ensureRevealColumns(db);
      const rows = await db.sql`
        SELECT c.id, c.code, c.url, c.title, c.code_checked_at, s.name AS store_name
        FROM coupons c JOIN stores s ON s.id = c.store_id WHERE c.id = ${Number(id)}
      `;
      if (!rows.length) throw new Error(`No coupon ${String(id)}`);
      const coupon = rows[0];
      if (coupon.code) return { id: coupon.id, code: coupon.code, cached: true };
      if (!coupon.url) return { id: coupon.id, code: null, reason: 'no page to read' };
      const checked = coupon.code_checked_at ? new Date(coupon.code_checked_at).getTime() : 0;
      if (checked && Date.now() - checked < RECHECK_HOURS * 3_600_000) {
        return { id: coupon.id, code: null, checked_at: coupon.code_checked_at, cached: true };
      }
      loadRootEnv();
      const d = revealDeps();
      if (!d) throw new Error('code reveal is not configured on this deployment');
      return revealForCoupon(db, coupon, d);
    },
  },
  {
    name: 'sync_deals',
    description: "Pull the next pages of nichedb.dev's deals collection into stores and coupons. Throttled to one run per ten minutes.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      return syncNichedbDeals(getDb());
    },
  },
  {
    name: 'sync_reddit',
    description:
      "Read the newest posts of r/couponcodes into stores and coupons: a post with a code or a link to the store becomes a listing, a request for a code is skipped. The site polls this itself every five minutes; throttled to one run per four minutes.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      return syncRedditCouponcodes(getDb());
    },
  },
  {
    name: 'sync_grocery',
    description:
      "Read the next few grocery weekly ads (Raley's, Safeway, Walmart, Target, Costco, H-E-B, Publix and the rest, across twenty US metros) into stores and coupons, one row per advertised price, and remove last week's. The site polls this itself every five minutes; throttled to one run per four minutes.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async run() {
      return syncFlippWeeklyAds(getDb());
    },
  },
  {
    name: 'reveal_pending',
    description: 'Read the deal pages of up to three coupons that have no code yet, most voted first, and say how many are still waiting.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 3 } }, additionalProperties: false },
    async run({ limit }) {
      loadRootEnv();
      const d = revealDeps();
      if (!d) throw new Error('code reveal is not configured on this deployment');
      return sweepReveals(getDb(), d, { limit: Math.min(3, Math.max(1, Number(limit) || 3)), maxMs: 150_000 });
    },
  },
];
