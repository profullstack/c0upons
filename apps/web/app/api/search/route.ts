import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';

  if (!q) return NextResponse.json([]);

  try {
    const db = getDb();
    const pattern = `%${q}%`;
    const results = await db.sql`
      SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo
      FROM coupons c
      JOIN stores s ON s.id = c.store_id
      WHERE c.title LIKE ${pattern}
        OR c.description LIKE ${pattern}
        OR s.name LIKE ${pattern}
        OR c.code LIKE ${pattern}
      ORDER BY c.votes DESC
      LIMIT 50
    `;
    return NextResponse.json(results);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
