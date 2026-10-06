/**
 * Coupons from the email intake, posted to the c0upons.com/bbs forums.
 *
 * Every coupon submit@c0upons.com turns into gets a thread in the forum that
 * fits it (Grocery & Weekly Ads, Tech Deals, Freebies...), with a link back to
 * its page here. Only the email intake does this: the nichedb, Flipp and Reddit
 * syncs bring in hundreds at a time, and a forum that is a mirror of the site
 * is a forum nobody reads.
 *
 * The board is tsbb, which takes `POST /api/v1/forums/<slug>/topics` with a
 * `tsbb_` bearer token minted for the poster account. Its flood guard refuses a
 * second post by the same account inside `posts.floodSeconds` (15 by default),
 * and one email can carry several offers, so posts go one at a time with a gap,
 * and a `flooding` answer waits and tries once more.
 *
 * `bbs_posts` remembers what was posted, so a coupon is never posted twice,
 * whatever retries upstream.
 */
import type { SqlDb } from './nichedb-sync.ts';

export const SITE = 'https://c0upons.com';

export interface BbsCoupon {
  id: number;
  store: string;
  storeSlug: string;
  title: string;
  code: string | null;
  description: string | null;
  discount: string | null;
  expiry_date: string | null;
}

/** The forums a coupon can land in, strongest signal first. Slugs are the board's. */
const FORUMS: Array<{ slug: string; words: RegExp }> = [
  {
    slug: 'grocery',
    words:
      /\b(grocer(y|ies)|supermarket|weekly ad|produce|snacks?|coffee|cereal|food|meal kits?|kroger|safeway|albertsons|aldi|publix|whole foods|trader joe'?s|instacart|hello ?fresh|heb|meijer|food lion|giant eagle|wegmans)\b/i,
  },
  {
    slug: 'tech-deals',
    words:
      /\b(tech|electronics?|laptops?|computers?|pcs?|phones?|iphone|android|tablets?|ipad|tvs?|monitors?|headphones?|earbuds|speakers?|gaming|xbox|playstation|ps5|nintendo|switch|ssd|gpus?|graphics card|vpn|software|apps?|smart ?home|camera|best ?buy|newegg|apple|samsung|dell|lenovo|logitech|anker)\b/i,
  },
  {
    slug: 'home-deals',
    words:
      /\b(home|garden|furniture|mattress(es)?|bedding|kitchen|cookware|appliances?|tools?|hardware|patio|lawn|decor|rugs?|harbor freight|home depot|lowe'?s|wayfair|ikea|overstock|bed bath)\b/i,
  },
  {
    slug: 'fashion-deals',
    words:
      /\b(clothing|clothes|apparel|fashion|shoes|sneakers|boots|dress(es)?|jeans|jackets?|handbags?|jewelry|watches|beauty|makeup|skin ?care|cosmetics|fragrance|perfume|hair ?care|nike|adidas|sephora|ulta|old navy|gap|h&m|zara|nordstrom|macy'?s)\b/i,
  },
  {
    slug: 'travel-deals',
    words:
      /\b(travel|flights?|airlines?|airfare|hotels?|resorts?|cruises?|car rentals?|vacations?|getaways?|expedia|booking\.com|priceline|hotels\.com|airbnb|vrbo|southwest|delta|united)\b/i,
  },
];

/** "Free shipping" is a perk, not a freebie. */
const FREEBIE = /\b(free(?!\s+(shipping|delivery|returns|trial))|freebies?|giveaway|free samples?|on the house)\b/i;

/**
 * Which forum a coupon belongs in.
 *
 * Coupons and stores carry no category, so this reads the words. A freebie is a
 * freebie wherever it is from; otherwise the topic forum that matches most, and
 * failing that Coupons & Promo Codes for a code or Hot Deals for a sale.
 */
export function pickForum(c: Pick<BbsCoupon, 'store' | 'title' | 'description' | 'code' | 'discount'>): string {
  const text = `${c.store} ${c.title} ${c.description ?? ''}`;
  if (FREEBIE.test(c.title) && !/\d+\s*%|\$\s*\d/.test(c.discount ?? '')) return 'freebies';
  let best: { slug: string; hits: number } | null = null;
  for (const f of FORUMS) {
    const hits = (text.match(new RegExp(f.words.source, 'gi')) ?? []).length;
    if (hits && (!best || hits > best.hits)) best = { slug: f.slug, hits };
  }
  if (best) return best.slug;
  return c.code ? 'coupons' : 'hot-deals';
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** The thread: a title a deal hunter scans for, and a body that sends them to the coupon. */
export function topicFor(c: BbsCoupon): { title: string; body: string } {
  const store = clean(c.store);
  const title = clean(c.title);
  const head = title.toLowerCase().includes(store.toLowerCase()) ? title : `${store}: ${title}`;
  const withCode = c.code && !head.includes(c.code) ? `${head} (code ${c.code})` : head;
  const lines = [
    `**Store:** [${store}](${SITE}/stores/${c.storeSlug})`,
    c.code ? `**Code:** \`${c.code}\`` : '**Code:** none needed',
    c.discount ? `**Deal:** ${clean(c.discount)}` : '',
    c.expiry_date ? `**Expires:** ${clean(c.expiry_date).slice(0, 10)}` : '',
    '',
    clean(c.description) && clean(c.description) !== title ? clean(c.description).slice(0, 1000) : '',
    '',
    `**[Get this deal on c0upons](${SITE}/coupons/${c.id})**`,
    '',
    '_Found in a retailer email to submit@c0upons.com. Codes can expire or have limits; reply if it worked or not._',
  ];
  return {
    title: withCode.slice(0, 160),
    body: lines.filter((l, i, all) => l !== '' || (all[i - 1] ?? '') !== '').join('\n').trim(),
  };
}

export async function ensureBbsSchema(db: SqlDb): Promise<void> {
  await db.sql`
    CREATE TABLE IF NOT EXISTS bbs_posts (
      coupon_id  INTEGER PRIMARY KEY,
      forum      TEXT NOT NULL,
      topic_url  TEXT,
      status     TEXT NOT NULL,
      error      TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export interface BbsDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Defaults to BBS_API_URL, else https://c0upons.com/bbs. */
  baseUrl?: string;
  /** Defaults to BBS_POST_TOKEN. Without one nothing is posted. */
  token?: string;
  /** Gap between two posts; tsbb's flood guard is 15 s by default. */
  gapMs?: number;
}

export interface BbsPostResult {
  coupon_id: number;
  forum: string;
  status: 'posted' | 'already' | 'failed' | 'disabled';
  url?: string;
  error?: string;
}

/**
 * Post each coupon once, one at a time.
 *
 * Read config at call time, not module load: Next inlines process.env at build.
 */
export async function postCouponsToBbs(db: SqlDb, coupons: BbsCoupon[], deps: BbsDeps = {}): Promise<BbsPostResult[]> {
  const token = deps.token ?? process.env.BBS_POST_TOKEN ?? '';
  const base = (deps.baseUrl ?? process.env.BBS_API_URL ?? `${SITE}/bbs`).replace(/\/+$/, '');
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const gap = deps.gapMs ?? 16_000;
  const out: BbsPostResult[] = [];
  if (!coupons.length) return out;
  if (!token) {
    return coupons.map((c) => ({ coupon_id: c.id, forum: pickForum(c), status: 'disabled' as const, error: 'BBS_POST_TOKEN is not set' }));
  }
  await ensureBbsSchema(db);

  let last = 0;
  for (const c of coupons) {
    const forum = pickForum(c);
    const prior = await db.sql`SELECT status, topic_url FROM bbs_posts WHERE coupon_id = ${c.id} LIMIT 1`;
    if (prior.length && prior[0].status === 'posted') {
      out.push({ coupon_id: c.id, forum, status: 'already', url: String(prior[0].topic_url ?? '') });
      continue;
    }
    const topic = topicFor(c);
    let result: BbsPostResult = { coupon_id: c.id, forum, status: 'failed' };
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = last + gap - Date.now();
      if (wait > 0) await sleep(wait);
      let res: Response;
      try {
        res = await doFetch(`${base}/api/v1/forums/${encodeURIComponent(forum)}/topics`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ title: topic.title, body: topic.body, format: 'markdown' }),
        });
      } catch (err) {
        result = { coupon_id: c.id, forum, status: 'failed', error: String((err as Error)?.message ?? err).slice(0, 300) };
        break;
      }
      last = Date.now();
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; code?: string };
      if (res.ok && data.url) {
        result = { coupon_id: c.id, forum, status: 'posted', url: `${base}${data.url}` };
        break;
      }
      const why = `${res.status} ${data.code ?? data.error ?? ''}`.trim();
      result = { coupon_id: c.id, forum, status: 'failed', error: why.slice(0, 300) };
      // The board's flood guard is the one refusal worth waiting out.
      if (!(res.status === 400 && /flood/i.test(why))) break;
    }
    await db.sql`
      INSERT INTO bbs_posts (coupon_id, forum, topic_url, status, error)
      VALUES (${c.id}, ${forum}, ${result.url ?? null}, ${result.status}, ${result.error ?? null})
      ON CONFLICT(coupon_id) DO UPDATE SET forum = excluded.forum, topic_url = excluded.topic_url,
        status = excluded.status, error = excluded.error
    `;
    out.push(result);
  }
  return out;
}
