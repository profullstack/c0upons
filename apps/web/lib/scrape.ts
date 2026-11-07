import 'server-only';
import { generateObject } from '@profullstack/ai-providers';
import { loadRootEnv } from './root-env';

export interface ScrapedListing {
  title: string | null;
  description: string | null;
  store_name: string | null;
  store_website: string | null;
  image_url: string | null;
  category: string | null;
}

// JSON Schema the model is constrained to. Every field is nullable so the model
// can leave anything it can't determine as null instead of hallucinating.
const SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: ['string', 'null'],
      description: 'Short product/deal title, e.g. "Sony WH-1000XM5 Headphones".',
    },
    description: {
      type: ['string', 'null'],
      description: 'One or two sentence description of the product or deal.',
    },
    store_name: {
      type: ['string', 'null'],
      description: 'The retailer/brand name, e.g. "Amazon" or "Nike".',
    },
    store_website: {
      type: ['string', 'null'],
      description: 'The store homepage URL (scheme + host only), e.g. "https://www.nike.com".',
    },
    image_url: {
      type: ['string', 'null'],
      description: 'Absolute URL of the primary product image.',
    },
    category: {
      type: ['string', 'null'],
      description: 'A single broad category, e.g. "Electronics", "Apparel", "Home".',
    },
  },
  required: ['title', 'description', 'store_name', 'store_website', 'image_url', 'category'],
  additionalProperties: false,
} as const;

/**
 * Peer nodes on c0mpute write about two tokens a second; a 1k-token answer can
 * take a few minutes. The route's maxDuration allows for it.
 */
export const SCRAPE_TIMEOUT_MS = Number(process.env.C0MPUTE_TIMEOUT_MS) || 170_000;

const FIELDS = SCHEMA.required;

/** Every field present (string or null), nothing else. Throws so the router repairs. */
export function parseListing(raw: unknown): ScrapedListing {
  if (!raw || typeof raw !== 'object') throw new Error('not an object');
  const o = raw as Record<string, unknown>;
  const out = {} as Record<string, string | null>;
  for (const f of FIELDS) {
    const v = o[f];
    if (v !== null && v !== undefined && typeof v !== 'string') throw new Error(`${f} is not a string`);
    out[f] = typeof v === 'string' && v.trim() ? v : null;
  }
  return out as unknown as ScrapedListing;
}

/** Fetch a page and reduce it to a compact, model-friendly text blob. */
async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      // A real UA — many sites block the default fetch agent.
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Failed to fetch URL (HTTP ${res.status})`);

  const html = await res.text();
  // Pull the <head> (meta/og tags live here) intact, then a stripped body.
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Head holds the structured signals; body text is a fallback for description.
  return `${head}\n\n${cleaned}`.slice(0, 16000);
}

/**
 * Scrape product/deal metadata from a listing URL with a model: c0mpute first
 * (@profullstack/ai-providers), Anthropic/OpenAI as paid fallbacks.
 * Throws on fetch or model failure so callers can surface a useful error.
 */
export async function scrapeListing(url: string): Promise<ScrapedListing> {
  loadRootEnv();
  const pageText = await fetchPageText(url);

  const { object } = await generateObject({
    feature: 'c0upons.scrape',
    name: 'Listing',
    maxTokens: 1024,
    temperature: 0,
    timeoutMs: SCRAPE_TIMEOUT_MS,
    jsonSchema: SCHEMA as unknown as Record<string, unknown>,
    schema: parseListing,
    user:
      `Extract structured coupon-listing metadata from this web page. ` +
      `The page is at the URL: ${url}\n\n` +
      `Use Open Graph / meta tags and the page title when available. ` +
      `For store_website, return only the scheme and host of the page URL. ` +
      `Make image_url an absolute URL. Leave any field null if you cannot determine it.\n\n` +
      `PAGE CONTENT:\n${pageText}`,
  });
  return object;
}
