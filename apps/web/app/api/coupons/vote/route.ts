import { NextRequest, NextResponse } from 'next/server';
import { getSessionDid } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';

export async function POST(req: NextRequest) {
  const did = await getSessionDid();
  if (!did) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = parseInt(body?.id);
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    const db = getDb();

    // Check for existing vote first (fast path for user feedback)
    const existing = await db.sql`
      SELECT id FROM coupon_votes WHERE coupon_id = ${id} AND voter_did = ${did}
    `;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'already_voted' }, { status: 409 });
    }

    // Atomic insert — UNIQUE(coupon_id, voter_did) constraint prevents
    // duplicates from concurrent requests; OR IGNORE handles the race
    // gracefully instead of throwing a constraint violation error
    await db.sql`INSERT OR IGNORE INTO coupon_votes (coupon_id, voter_did) VALUES (${id}, ${did})`;
    await db.sql`UPDATE coupons SET votes = votes + 1 WHERE id = ${id}`;

    const rows = await db.sql`SELECT votes FROM coupons WHERE id = ${id}`;
    return NextResponse.json({ success: true, votes: rows[0]?.votes ?? 0 });
  } catch (err) {
    console.error(err);
    return dbErrorResponse(err, 'Failed to vote');
  }
}
