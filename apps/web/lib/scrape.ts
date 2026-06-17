import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { loadRootEnv } from './root-env';

export interface ScrapedListing {
  title: string | null;
  description: string | null;
  store_name: string | null;
  store_website: string | null;
  image_url: string | null;
  category: string | null;
}

const MODEL = 'claude-opus-4-8';

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

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    loadRootEnv();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
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
 * Scrape product/deal metadata from a listing URL using Claude.
 * Throws on fetch or API failure so callers can surface a useful error.
 */
export async function scrapeListing(url: string): Promise<ScrapedListing> {
  const pageText = await fetchPageText(url);

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content:
          `Extract structured coupon-listing metadata from this web page. ` +
          `The page is at the URL: ${url}\n\n` +
          `Use Open Graph / meta tags and the page title when available. ` +
          `For store_website, return only the scheme and host of the page URL. ` +
          `Make image_url an absolute URL. Leave any field null if you cannot determine it.\n\n` +
          `PAGE CONTENT:\n${pageText}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No content returned from model');

  return JSON.parse(text.text) as ScrapedListing;
}
