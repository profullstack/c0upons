import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';

// Never cache: a cached 200 would keep reporting health after the database goes
// away.
export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the database: an unreachable database answers 503 here
 * loudly instead of silently emptying the pages that swallow their own DB
 * errors. (It once also kept a Turso free-tier group from being archived; the
 * database is self-hosted Postgres now and needs no keep-alive.)
 */
export async function GET() {
  try {
    const db = getDb();
    await db.sql`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(err);
    return dbErrorResponse(err, 'Database health check failed');
  }
}
