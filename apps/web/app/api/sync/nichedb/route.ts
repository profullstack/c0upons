import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { syncNichedbDeals } from '@/lib/nichedb-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Pull the next pages of nichedb.dev's deals collection into stores and coupons.
 *
 * Keyless on purpose: the data it copies is public, the write is an idempotent
 * upsert, and `.github/workflows/db-keepalive.yml` is what calls it every
 * fifteen minutes, so a secret here would be one more thing to provision before
 * the site fills up. What stops a stranger from making nichedb pay for a
 * refresh storm is the throttle inside the sync itself: a run within ten
 * minutes of the last one answers `skipped` without fetching anything.
 */
async function run() {
  try {
    const result = await syncNichedbDeals(getDb());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('nichedb sync failed:', err);
    return dbErrorResponse(err, 'nichedb sync failed');
  }
}

export async function POST() {
  return run();
}

export async function GET() {
  return run();
}
