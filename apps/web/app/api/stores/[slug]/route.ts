import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const db = getDb();
    const stores = await db.sql`SELECT * FROM stores WHERE slug = ${slug}`;
    if (!stores.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const store = stores[0];
    const coupons = await db.sql`
      SELECT * FROM coupons WHERE store_id = ${store.id}
      ORDER BY votes DESC, created_at DESC
    `;
    return NextResponse.json({ store, coupons });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch store' }, { status: 500 });
  }
}
