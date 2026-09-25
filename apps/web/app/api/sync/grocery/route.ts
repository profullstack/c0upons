import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { syncFlippWeeklyAds } from '@/lib/flipp-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Read the next few grocery weekly ads (Raley's, Safeway, Walmart, H-E-B...)
 * into stores and coupons, via Flipp's public flyer data.
 *
 * Keyless like the other syncs: the circulars are public, the write is an
 * idempotent upsert, and the callers are our own poller (every ten minutes
 * from `instrumentation.ts`), the keepalive workflow and the CLI. A run
 * within eight minutes of the last one answers `skipped`.
 */
async function run() {
  try {
    const result = await syncFlippWeeklyAds(getDb());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('grocery sync failed:', err);
    return dbErrorResponse(err, 'grocery sync failed');
  }
}

export async function POST() {
  return run();
}

export async function GET() {
  return run();
}
