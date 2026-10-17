import { NextRequest } from 'next/server';

// Always answers 200 with an image so a store logo is never a broken link.
// See lib/logo.ts.

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const CACHE = 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400';

function letterTile(domain: string): Response {
  const letter = (domain.replace(/^www\./i, '')[0] ?? '?').toUpperCase().replace(/[^A-Z0-9]/, '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#fff7ed"/><text x="32" y="42" font-family="system-ui,sans-serif" font-size="30" font-weight="900" text-anchor="middle" fill="#f97316">${letter}</text></svg>`;
  return new Response(svg, { status: 200, headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': CACHE } });
}

export async function GET(req: NextRequest) {
  const domain = (req.nextUrl.searchParams.get('domain') ?? '').trim().toLowerCase();
  const sz = Math.min(256, Math.max(16, Number(req.nextUrl.searchParams.get('sz')) || 128));
  if (!HOSTNAME.test(domain)) return letterTile(domain);

  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    const type = res.headers.get('content-type') ?? '';
    // A 404 from Google still carries its generic globe icon; serve it as 200.
    if (type.startsWith('image/')) {
      const body = await res.arrayBuffer();
      if (body.byteLength > 0) {
        return new Response(body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': CACHE } });
      }
    }
  } catch {
    // fall through to the letter tile
  }
  return letterTile(domain);
}
