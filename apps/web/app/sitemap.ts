import type { MetadataRoute } from 'next';
import { getDb } from '@/lib/db';

const BASE = 'https://c0upons.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/stores`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/submit`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/docs`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/search`, changeFrequency: 'monthly', priority: 0.5 },
  ];

  try {
    const db = getDb();

    const stores = await db.sql`SELECT slug, created_at FROM stores ORDER BY created_at DESC`;
    const coupons = await db.sql`SELECT id, created_at FROM coupons ORDER BY created_at DESC`;

    const storeRoutes: MetadataRoute.Sitemap = stores.map((s: { slug: string; created_at: string }) => ({
      url: `${BASE}/stores/${s.slug}`,
      lastModified: s.created_at ? new Date(s.created_at) : undefined,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    const couponRoutes: MetadataRoute.Sitemap = coupons.map((c: { id: number; created_at: string }) => ({
      url: `${BASE}/coupons/${c.id}`,
      lastModified: c.created_at ? new Date(c.created_at) : undefined,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));

    return [...staticRoutes, ...storeRoutes, ...couponRoutes];
  } catch {
    return staticRoutes;
  }
}
