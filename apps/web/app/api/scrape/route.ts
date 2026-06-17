import { NextRequest, NextResponse } from 'next/server';
import { scrapeListing } from '@/lib/scrape';

// Scraping fetches an external page and calls Claude — give it room.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'url is not a valid URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'url must be http or https' }, { status: 400 });
  }

  try {
    const listing = await scrapeListing(parsed.toString());
    return NextResponse.json(listing);
  } catch (err) {
    console.error('scrape failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to scrape URL';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
