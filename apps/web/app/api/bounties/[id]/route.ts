import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const rows = await db.sql`
      SELECT b.*, s.name AS store_name_resolved,
             c.code AS coupon_code, c.title AS coupon_title
      FROM bounties b
      LEFT JOIN stores s ON s.id = b.store_id
      LEFT JOIN coupons c ON c.id = b.coupon_id
      WHERE b.id = ${parseInt(id)}
    `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch bounty' }, { status: 500 });
  }
}
