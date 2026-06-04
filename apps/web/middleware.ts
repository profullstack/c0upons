import { NextRequest, NextResponse } from 'next/server';

const CANONICAL = 'https://c0upons.com';

export function middleware(req: NextRequest) {
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
