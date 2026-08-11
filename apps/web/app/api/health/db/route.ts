import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';

// Never cache: a cached 200 would keep reporting health after the database goes
// away, and the keep-alive query has to actually reach Turso to count as
// activity.
export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the database, and the query the keep-alive schedule runs.
 *
 * Turso archives a free group after ten days without activity, and an archived
 * group needs an explicit unarchive call before it serves queries again. So the
 * cheapest cure is to never go idle: `.github/workflows/db-keepalive.yml` calls
 * this on a schedule, and the `SELECT 1` is the activity that resets the clock.
 * It doubles as monitoring — an unreachable database answers 503 here loudly
 * instead of silently emptying the pages that swallow their own DB errors.
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
