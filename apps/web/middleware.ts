import { gate } from "@/lib/crawl-gateway";
import { NextRequest, NextResponse } from 'next/server';

const CANONICAL = 'https://c0upons.com';

export async function middleware(req: NextRequest) {
  // Crawl gateway first: AI training crawlers get 402 Payment Required (or the
  // sales page at /crawl) unless they present a paid pass. People, Googlebot
  // and retrieval crawlers fall through to everything below.
  const answer = await gate(req);
  if (answer) return answer;

  const host = req.headers.get('host') ?? '';
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';

  // Strip www
  const isWww = host.startsWith('www.');
  // Redirect railway temp domain to canonical
  const isRailway = host.endsWith('.railway.app') || host.endsWith('.up.railway.app');
  // Redirect plain http to https (in case Railway forwards it)
  const isHttp = proto === 'http';

  if (isWww || isRailway || isHttp) {
    const url = req.nextUrl.clone();
    url.protocol = 'https';
    url.host = 'c0upons.com';
    url.port = '';
    return NextResponse.redirect(url, { status: 301 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.svg|favicon\\.ico|api/webhooks|.*\\.png|.*\\.svg|.*\\.jpg|.*\\.webp).*)',
  ],
};
