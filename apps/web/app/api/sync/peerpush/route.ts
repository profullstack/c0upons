import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { syncPeerpushDeals } from '@/lib/peerpush-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Read peerpush.com/deals into stores and coupons now, instead of waiting for
 * the daemon's daily run. Keyless like the other syncs: the deals are public
 * and the write is an idempotent upsert; a run within an hour of the last one
 * answers `skipped`, so a stranger cannot make us hammer PeerPush.
 */
async function run() {
  try {
    const result = await syncPeerpushDeals(getDb());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('peerpush sync failed:', err);
    return dbErrorResponse(err, 'peerpush sync failed');
  }
}

export async function POST() {
  return run();
}

export async function GET() {
  return run();
}
