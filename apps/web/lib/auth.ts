import 'server-only';
import { cookies } from 'next/headers';

const COOKIE = 'cp_session';
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';
const enc = new TextEncoder();

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SESSION_SECRET),
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
