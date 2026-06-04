import { NextRequest, NextResponse } from 'next/server';
import { createSession, COOKIE } from '@/lib/auth';

const CLIENT_ID = process.env.COINPAY_MERCHANT_ID!;
const CLIENT_SECRET = process.env.COINPAY_API_KEY!;
const BASE = 'https://coinpayportal.com';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://c0upons.up.railway.app'}/api/auth/callback`;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  const storedState = req.cookies.get('cp_state')?.value;
  const codeVerifier = req.cookies.get('cp_pkce')?.value;
  const returnTo = req.cookies.get('cp_return')?.value ?? '/';

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(msg)}`, req.url));

  if (error) return fail(error);
  if (!code) return fail('No code returned');
  if (!state || state !== storedState) return fail('State mismatch');
  if (!codeVerifier) return fail('Missing PKCE verifier');

  // Exchange code for tokens
  const tokenRes = await fetch(`${BASE}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    console.error('Token exchange failed:', t);
    return fail('Token exchange failed');
  }

  const { access_token } = await tokenRes.json();

  // Get user info + DID
  const userRes = await fetch(`${BASE}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) return fail('Could not fetch user info');

  const user = await userRes.json();
  let did: string = user.did ?? user.sub;

  // If no DID yet, claim one
  if (!did || !did.startsWith('did:')) {
    const claimRes = await fetch(`${BASE}/api/reputation/did/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ client_id: CLIENT_ID }),
    });
    if (claimRes.ok) {
      const claimed = await claimRes.json();
      did = claimed.did ?? did;
    }
  }

  if (!did) return fail('Could not resolve DID');

  const session = await createSession(did);
  const res = NextResponse.redirect(new URL(returnTo, req.url));
  res.cookies.set(COOKIE, session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });
  res.cookies.delete('cp_pkce');
  res.cookies.delete('cp_state');
  res.cookies.delete('cp_return');
  return res;
}
