import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { syncRedditCouponcodes } from '@/lib/reddit-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Read r/couponcodes' newest posts into stores and coupons.
 *
 * Keyless like the nichedb sync, and for the same reasons: the posts are
 * public, the write is an idempotent upsert, and the callers are our own
 * poller (every five minutes from `instrumentation.ts`), the keepalive
 * workflow and the CLI. The throttle inside the sync answers `skipped` to a
 * run within four minutes of the last one, so a stranger hammering this
 * cannot make Reddit or the relay pay for it.
 */
async function run() {
  try {
    const result = await syncRedditCouponcodes(getDb());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('reddit sync failed:', err);
    return dbErrorResponse(err, 'reddit sync failed');
  }
}

export async function POST() {
  return run();
}

export async function GET() {
  return run();
}
