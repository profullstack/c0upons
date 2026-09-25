import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { loadRootEnv } from '@/lib/root-env';
import { RECHECK_HOURS, ensureRevealColumns, revealDeps, revealForCoupon } from '@/lib/reveal-coupon';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * Reveal the code for one coupon by driving a browser through its deal page.
 *
 * Answers at once when the row already has a code, or when the page was read
 * within the last day and had none, so a busy coupon page costs one crawl a
 * day at most. Otherwise it reads the page (the model when a key has quota,
 * the scripted walk when not), stores what it found, and answers with it.
 * 503 when the deployment has no Obscura relay, which is how local dev looks.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const couponId = Number.parseInt(id, 10);
  if (!Number.isFinite(couponId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  try {
    const db = getDb();
    await ensureRevealColumns(db);
    const rows = await db.sql`
      SELECT c.id, c.code, c.url, c.title, c.code_checked_at, c.source, s.name AS store_name
      FROM coupons c JOIN stores s ON s.id = c.store_id
      WHERE c.id = ${couponId}
    `;
    if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const coupon = rows[0];
    if (coupon.code) return NextResponse.json({ code: coupon.code, cached: true });
    if (!coupon.url) return NextResponse.json({ code: null, reason: 'no page to read' });
    // A weekly-ad price is the deal itself; a circular hides no code.
    if (coupon.source === 'flipp') return NextResponse.json({ code: null, reason: 'weekly ad price, no code' });

    const checked = coupon.code_checked_at ? new Date(coupon.code_checked_at).getTime() : 0;
    if (checked && Date.now() - checked < RECHECK_HOURS * 3_600_000) {
      return NextResponse.json({ code: null, checked_at: coupon.code_checked_at, cached: true });
    }

    loadRootEnv();
    const d = revealDeps();
    if (!d) return NextResponse.json({ error: 'code reveal is not configured' }, { status: 503 });

    const { id: _id, ...out } = await revealForCoupon(db, coupon, d);
    void _id;
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('reveal failed:', err);
    return dbErrorResponse(err, 'code reveal failed');
  }
}
