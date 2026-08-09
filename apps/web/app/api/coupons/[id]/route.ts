import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = getDb();
    const rows = await db.sql`
      SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo
      FROM coupons c
      JOIN stores s ON s.id = c.store_id
      WHERE c.id = ${parseInt(id)}
    `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error(err);
    return dbErrorResponse(err, 'Failed to fetch coupon');
  }
}
