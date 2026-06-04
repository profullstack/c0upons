import { NextResponse } from 'next/server';
import { getSessionDid } from '@/lib/auth';

export async function GET() {
  const did = await getSessionDid();
  return NextResponse.json({ did: did ?? null });
}
