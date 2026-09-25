import 'server-only';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { Coupon } from '@/lib/types';

/**
 * One coupon with its store joined on.
 *
 * Wrapped in React's `cache` so the three consumers of a single request — the
 * page body, `generateMetadata` and the OG image — share one query instead of
 * hitting Turso three times per render.
 */
export const getCoupon = cache(async (id: string): Promise<Coupon | null> => {
  const numericId = Number.parseInt(id, 10);
  if (!Number.isInteger(numericId)) return null;
  try {
    const db = getDb();
    const rows = await db.sql`
      SELECT c.*,
             s.name AS store_name,
             s.slug AS store_slug,
             s.logo_url AS store_logo,
             s.website AS store_website
      FROM coupons c
      JOIN stores s ON s.id = c.store_id
      WHERE c.id = ${numericId}
    `;
    return rows.length ? rows[0] : null;
  } catch {
    return null;
  }
});
