import { createBridgeHost, type BridgeHost } from '@profullstack/bridges';
import { COOKIE, parseSession } from '@/lib/auth';
import { memberByDid } from '@/lib/members';

/**
 * c0upons accounts on other apps (@profullstack/bridges): the forum at /bbs
 * signs c0upons members in with these two endpoints, silently when they are
 * already signed in here.
 *
 *   GET  /api/v1/bridge/authorize   OAuth 2.1 authorization (code + PKCE S256)
 *   POST /api/v1/bridge/token       code -> the member's DID and name
 *
 * The client secret lives in the vault (BRIDGE_TSBB_SECRET); without it the
 * bridge answers 404 and the forum keeps its own sign-in only.
 */
export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://c0upons.com';

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

let host: BridgeHost | null | undefined;

function bridge(): BridgeHost | null {
  if (host !== undefined) return host;
  const secret = process.env.BRIDGE_TSBB_SECRET;
  host = secret
    ? createBridgeHost({
        clients: {
          tsbb: {
            secret,
            redirectUris: [process.env.BRIDGE_TSBB_REDIRECT_URI ?? `${APP_URL}/bbs/auth/bridge/callback`],
          },
        },
        async getUser(request) {
          const cookie = readCookie(request, COOKIE);
          const did = cookie ? await parseSession(cookie) : null;
          if (!did) return null;
          const member = await memberByDid(did).catch(() => null);
          // CoinPay does not verify emails, so none is passed as verified.
          return { sub: did, name: member?.name ?? undefined };
        },
        // Sign in with CoinPay, then come straight back to this authorize request.
        loginUrl(returnTo) {
          const back = new URL(returnTo);
          return `${APP_URL}/api/auth/coinpay?returnTo=${encodeURIComponent(back.pathname + back.search)}`;
        },
      })
    : null;
  return host;
}

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const b = bridge();
  if (!b || (await params).action !== 'authorize') return new Response('Not found', { status: 404 });
  return b.authorize(request);
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const b = bridge();
  if (!b || (await params).action !== 'token') return new Response('Not found', { status: 404 });
  return b.token(request);
}
