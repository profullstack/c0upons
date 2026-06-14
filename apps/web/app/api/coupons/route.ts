import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionDid } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const db = getDb();
    const coupons = await db.sql`
      SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo
      FROM coupons c
      JOIN stores s ON s.id = c.store_id
      ORDER BY c.votes DESC, c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return NextResponse.json(coupons);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const did = await getSessionDid();
  if (!did) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  try {
    const body = await req.json();
    const { store_id, code, title, description, discount, expiry_date, url } = body;

    if (!store_id || !title) {
      return NextResponse.json({ error: 'store_id and title are required' }, { status: 400 });
    }

    const db = getDb();
    await db.sql`
      INSERT INTO coupons (store_id, code, title, description, discount, expiry_date, url)
      VALUES (${store_id}, ${code}, ${title}, ${description}, ${discount}, ${expiry_date}, ${url})
    `;
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }
}
