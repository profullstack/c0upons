import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = process.env.COINPAY_API_KEY!;
const BASE = 'https://coinpayportal.com';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://c0upons.up.railway.app'}/api/auth/callback`;

function base64url(buf: ArrayBuffer | Uint8Array): string {
  return Buffer.from(buf as ArrayBuffer).toString('base64url');
}

export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo') ?? '/';

  // PKCE
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = base64url(verifierBytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64url(digest);

  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));

  const url = new URL(`${BASE}/api/oauth/authorize`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid did profile');
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);

  const res = NextResponse.redirect(url.toString());
  const cookieOpts = { httpOnly: true, secure: true, sameSite: 'lax' as const, maxAge: 600, path: '/' };
  res.cookies.set('cp_pkce', codeVerifier, cookieOpts);
  res.cookies.set('cp_state', state, cookieOpts);
  res.cookies.set('cp_return', returnTo, cookieOpts);
  return res;
}
