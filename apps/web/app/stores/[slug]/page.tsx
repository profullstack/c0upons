export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import CouponCard from '@/components/CouponCard';
import { getDb } from '@/lib/db';
import { Coupon, Store } from '@/lib/types';
import { BASE, truncate } from '@/lib/coupon-seo';

const getStore = cache(async (slug: string): Promise<{ store: Store; coupons: Coupon[] } | null> => {
  try {
    const db = getDb();
    const stores = await db.sql`SELECT * FROM stores WHERE slug = ${slug}`;
    if (!stores.length) return null;
    const store = stores[0];
    const coupons = await db.sql`
      SELECT * FROM coupons WHERE store_id = ${store.id}
      ORDER BY votes DESC, created_at DESC
    `;
    return { store, coupons };
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getStore(slug);
  if (!data) return { title: 'Store not found', robots: { index: false, follow: true } };

  const { store, coupons } = data;
  const url = `${BASE}/stores/${slug}`;
  const title = truncate(`${store.name} Coupon Codes & Deals`, 62);
  const count = coupons.length;
  const description = truncate(
    count > 0
      ? `${count} ${store.name} coupon code${count === 1 ? '' : 's'} and deals, posted and voted on by the c0upons community. Free to use, no account needed.`
      : `${store.name} coupon codes and deals on c0upons. Free to use, no account needed.`,
    158
  );

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'c0upons',
      type: 'website',
      locale: 'en_US',
      images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [`${BASE}/opengraph-image`] },
  };
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getStore(slug);
  if (!data) notFound();

  const { store, coupons } = data;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-6">
        {store.logo_url ? (
          <Image src={store.logo_url} alt={store.name} width={64} height={64} className="rounded object-contain" />
        ) : (
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-2xl font-bold text-gray-400">
            {store.name[0]}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black text-gray-900">{store.name}</h1>
          {store.website && (
            <a href={store.website} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-500 hover:underline">
              {store.website}
            </a>
          )}
          <p className="text-sm text-gray-400 mt-1">{coupons.length} coupons available</p>
        </div>
      </div>

      {coupons.length === 0 ? (
        <p className="text-gray-400">No coupons for this store yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map((c) => (
            <CouponCard key={c.id} coupon={{ ...c, store_name: store.name, store_slug: slug, store_logo: store.logo_url }} />
          ))}
        </div>
      )}
    </div>
  );
}
