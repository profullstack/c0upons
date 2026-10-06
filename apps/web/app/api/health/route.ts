import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Never cache: a cached 200 would keep reporting health after the app goes away.
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Liveness for status.profullstack.com: the app answers and the database
 * answers `SELECT 1` within 3s. Unlike /api/health/db it never says why it
 * failed.
 */
export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getDb().sql`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 3000);
      }),
    ]);
    return NextResponse.json({ status: 'ok', db: 'ok' }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ status: 'error', db: 'down' }, { status: 503, headers: NO_STORE });
  } finally {
    clearTimeout(timer);
  }
}
