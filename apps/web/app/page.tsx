export const dynamic = 'force-dynamic';

import Link from 'next/link';
import CouponCard from '@/components/CouponCard';
import StoreCard from '@/components/StoreCard';
import SearchBar from '@/components/SearchBar';
import { getDb } from '@/lib/db';
import { Coupon, Store } from '@/lib/types';

interface StoreWithCount extends Store {
  coupon_count: number;
}

async function getTrendingCoupons(): Promise<Coupon[]> {
  try {
    const db = getDb();
    return await db.sql`
      SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo
      FROM coupons c
      JOIN stores s ON s.id = c.store_id
      ORDER BY c.votes DESC, c.created_at DESC
      LIMIT 12
    `;
  } catch {
    return [];
  }
}

async function getTopStores(): Promise<StoreWithCount[]> {
  try {
    const db = getDb();
    const stores: StoreWithCount[] = await db.sql`
      SELECT s.*, COUNT(c.id) AS coupon_count
      FROM stores s
      LEFT JOIN coupons c ON c.store_id = s.id
      GROUP BY s.id
      ORDER BY coupon_count DESC, s.name ASC
      LIMIT 12
    `;
    return stores;
  } catch {
    return [];
  }
}

async function getStats(): Promise<{ coupons: number; stores: number }> {
  try {
    const db = getDb();
    const [{ total: coupons }] = await db.sql`SELECT COUNT(*) as total FROM coupons`;
    const [{ total: stores }] = await db.sql`SELECT COUNT(*) as total FROM stores`;
    return { coupons, stores };
  } catch {
    return { coupons: 0, stores: 0 };
  }
}

export default async function HomePage() {
  const [coupons, stores, stats] = await Promise.all([
    getTrendingCoupons(),
    getTopStores(),
    getStats(),
  ]);

  return (
    <div className="flex flex-col gap-16">
      {/* Hero */}
      <section className="-mx-4 -mt-10 px-4 pt-16 pb-14 bg-gradient-to-b from-orange-50 to-white text-center">
        <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
          <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 text-xs font-semibold px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
            Community-powered · always free
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-tight tracking-tight">
            Find & share the{' '}
            <span className="text-orange-500">best coupon codes</span>
          </h1>
          <p className="text-gray-500 text-lg">
            Real deals from real people. Browse {stats.coupons.toLocaleString()} coupons across{' '}
            {stats.stores.toLocaleString()} stores.
          </p>
          <div className="w-full max-w-lg">
            <SearchBar />
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-400 pt-2">
            <span className="flex items-center gap-1.5">
              <span className="font-bold text-gray-700">{stats.coupons.toLocaleString()}</span> coupons
            </span>
            <span className="w-px h-4 bg-gray-200" />
            <span className="flex items-center gap-1.5">
              <span className="font-bold text-gray-700">{stats.stores.toLocaleString()}</span> stores
            </span>
            <span className="w-px h-4 bg-gray-200" />
            <span className="flex items-center gap-1.5">
              <span className="font-bold text-gray-700">100%</span> free
            </span>
          </div>
        </div>
      </section>

      {/* Trending Coupons */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Trending Coupons</h2>
            <p className="text-sm text-gray-500 mt-0.5">Highest voted by the community</p>
          </div>
          <Link href="/submit" className="text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors">
            + Submit a code
          </Link>
        </div>
        {coupons.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg font-medium">No coupons yet.</p>
            <p className="text-sm mt-1">Be the first to <Link href="/submit" className="text-orange-500 hover:underline">submit one</Link>!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {coupons.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        )}
      </section>

      {/* Top Stores */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Popular Stores</h2>
            <p className="text-sm text-gray-500 mt-0.5">Browse by retailer</p>
          </div>
          <Link href="/stores" className="text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors">
            View all →
          </Link>
        </div>
        {stores.length === 0 ? (
          <p className="text-gray-400">No stores yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {stores.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        )}
      </section>

      {/* CLI CTA */}
      <section className="bg-gray-900 rounded-2xl p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-white">Use c0upons from your terminal</h2>
          <p className="text-gray-400 text-sm mt-1">Search and browse coupons without leaving the command line.</p>
        </div>
        <div className="flex flex-col gap-3 w-full md:w-auto">
          <code className="bg-gray-800 text-orange-400 font-mono text-sm px-4 py-3 rounded-lg whitespace-nowrap">
            curl -fsSL https://c0upons.com/install.sh | sh
          </code>
          <Link
            href="/docs#cli"
            className="text-center text-sm text-gray-400 hover:text-white transition-colors"
          >
            View CLI docs →
          </Link>
        </div>
      </section>
    </div>
  );
}
