import 'server-only';
import { cookies } from 'next/headers';

const COOKIE = 'cp_session';
const enc = new TextEncoder();

// Resolve the secret lazily (at request time) rather than at module import.
// Throwing at import breaks `next build` page-data collection, which imports
// route modules in an environment without runtime secrets. This still enforces
// #20's intent: no insecure fallback, and requests fail if the secret is unset.
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is required');
  }
  return secret;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Buffer.from(sig).toString('base64url');
}

export async function createSession(did: string): Promise<string> {
  const payload = `${did}|${Date.now()}`;
  const sig = await hmac(payload);
  return `${payload}|${sig}`;
}

export async function parseSession(value: string): Promise<string | null> {
  const parts = value.split('|');
  if (parts.length !== 3) return null;
  const [did, ts, sig] = parts;
  const payload = `${did}|${ts}`;
  const expected = await hmac(payload);
  if (expected !== sig) return null;
  // Expire after 30 days
  if (Date.now() - parseInt(ts) > 30 * 24 * 60 * 60 * 1000) return null;
  return did;
}

export async function getSessionDid(): Promise<string | null> {
  try {
    const jar = await cookies();
    const val = jar.get(COOKIE)?.value;
    if (!val) return null;
    return parseSession(val);
  } catch {
    return null;
  }
}

export { COOKIE };
