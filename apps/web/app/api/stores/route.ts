import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { getSessionDid } from '@/lib/auth';

export async function GET() {
  try {
    const db = getDb();
    const stores = await db.sql`
      SELECT s.*, COUNT(c.id) AS coupon_count
      FROM stores s
      LEFT JOIN coupons c ON c.store_id = s.id
      GROUP BY s.id
      ORDER BY s.name ASC
    `;
    return NextResponse.json(stores);
  } catch (err) {
    console.error(err);
    return dbErrorResponse(err, 'Failed to fetch stores');
  }
}

export async function POST(req: NextRequest) {
  const did = await getSessionDid();
  if (!did) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, slug, logo_url, website, category_id } = body;
    if (!name || !slug) {
      return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
    }
    const db = getDb();
    await db.sql`
      INSERT INTO stores (name, slug, logo_url, website, category_id)
      VALUES (${name}, ${slug}, ${logo_url}, ${website}, ${category_id})
    `;
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error(err);
    return dbErrorResponse(err, 'Failed to create store');
  }
}
