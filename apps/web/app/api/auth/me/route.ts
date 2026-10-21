import { NextResponse } from 'next/server';
import { getSessionDid } from '@/lib/auth';
import { memberByDid } from '@/lib/members';

export async function GET() {
  const did = await getSessionDid();
  let email: string | null = null;
  if (did) {
    try {
      email = (await memberByDid(did))?.email ?? null;
    } catch {
      email = null;
    }
  }
  return NextResponse.json({ did: did ?? null, email });
}
