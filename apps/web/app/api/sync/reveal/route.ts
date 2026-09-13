import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { loadRootEnv } from '@/lib/root-env';
import { revealDeps, sweepReveals } from '@/lib/reveal-coupon';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/** Coupons read per call; a page takes 25 to 60 seconds through the browser. */
const PER_RUN = 3;

/**
 * Read the deal pages of the coupons that have no code yet, a few per call.
 *
 * The keep-alive schedule calls this every fifteen minutes after the nichedb
 * sync, so every coupon that arrives is read within days, and anyone can call
 * it to move the queue along: it is keyless because it only reads public
 * pages, and the one browser page serialises the work whatever the caller.
 * Answers how many are left, so a loop knows when to stop.
 */
export async function POST(req: NextRequest) {
  try {
    loadRootEnv();
    const d = revealDeps();
    if (!d) return NextResponse.json({ error: 'code reveal is not configured' }, { status: 503 });
    const limit = Math.min(PER_RUN, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || PER_RUN));
    const result = await sweepReveals(getDb(), d, { limit, maxMs: 150_000 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('reveal sweep failed:', err);
    return dbErrorResponse(err, 'reveal sweep failed');
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
