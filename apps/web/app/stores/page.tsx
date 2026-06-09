export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import StoreCard from '@/components/StoreCard';
import { getDb } from '@/lib/db';
import { Store } from '@/lib/types';

interface StoreWithCount extends Store {
  coupon_count: number;
}

export const metadata: Metadata = {
  title: 'All Stores',
  description:
    'Browse coupon codes for hundreds of online stores — from fashion and electronics to groceries and travel. Find the best promo codes for your favourite retailer.',
  alternates: { canonical: 'https://c0upons.com/stores' },
};

async function getStores(): Promise<StoreWithCount[]> {
  try {
    const db = getDb();
    return await db.sql`
      SELECT s.*, COUNT(c.id) AS coupon_count
      FROM stores s
      LEFT JOIN coupons c ON c.store_id = s.id
      GROUP BY s.id
      ORDER BY s.name ASC
    `;
  } catch {
    return [];
  }
}

const STORE_CATEGORIES = [
  { name: 'Fashion & Apparel', examples: 'clothing, shoes, accessories' },
  { name: 'Electronics & Tech', examples: 'gadgets, software, subscriptions' },
  { name: 'Home & Garden', examples: 'furniture, tools, décor' },
  { name: 'Food & Groceries', examples: 'meal kits, delivery, snacks' },
  { name: 'Travel & Hotels', examples: 'flights, stays, car rental' },
  { name: 'Beauty & Health', examples: 'skincare, fitness, wellness' },
];

export default async function StoresPage() {
  const stores = await getStores();

  const grouped = stores.reduce<Record<string, StoreWithCount[]>>((acc, store) => {
    const letter = store.name[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(store);
    return acc;
  }, {});

  const letters = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-3xl font-black text-gray-900">All Stores</h1>
        <p className="text-gray-500 mt-1">
          {stores.length > 0
            ? `${stores.length} stores with active coupons`
            : 'Browse coupon codes by retailer'}
        </p>
      </div>

      {stores.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {letters.map((l) => (
            <a
              key={l}
              href={`#letter-${l}`}
              className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded font-semibold text-sm hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-colors"
            >
              {l}
            </a>
          ))}
        </div>
      )}

      {letters.map((letter) => (
        <section key={letter} id={`letter-${letter}`}>
          <h2 className="text-lg font-bold text-gray-700 mb-3 border-b pb-1">{letter}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {grouped[letter].map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        </section>
      ))}

      {stores.length === 0 && (
        <div className="flex flex-col gap-10">
          {/* Call-to-action */}
          <div className="text-center py-12 border border-dashed border-gray-200 rounded-2xl">
            <p className="text-gray-500 font-medium text-lg">Stores are being added.</p>
            <p className="text-sm text-gray-400 mt-1 mb-5">
              Know a store that should be here? Submit a coupon and the store will be created automatically.
            </p>
            <Link
              href="/submit"
              className="inline-flex bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              Submit a coupon code
            </Link>
          </div>

          {/* Category overview so the page is never content-empty for crawlers */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Store categories</h2>
            <p className="text-sm text-gray-500 mb-6">
              c0upons covers coupon codes across a wide range of retail categories. Once stores are
              added they will appear here, organised alphabetically.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {STORE_CATEGORIES.map((cat) => (
                <div
                  key={cat.name}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex flex-col gap-1"
                >
                  <h3 className="font-semibold text-gray-900 text-sm">{cat.name}</h3>
                  <p className="text-xs text-gray-500">{cat.examples}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How stores work */}
          <section className="bg-orange-50 rounded-2xl p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">How store pages work</h2>
            <ol className="flex flex-col gap-4 list-none">
              <li className="flex gap-3">
                <span className="text-orange-500 font-black text-lg shrink-0">1</span>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Submit a coupon for any store</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Use the <Link href="/submit" className="text-orange-600 hover:underline">Submit</Link> page
                    to add a working promo code. If the store doesn&apos;t exist yet, it is created automatically.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-500 font-black text-lg shrink-0">2</span>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Community verifies the code</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Other shoppers upvote or flag codes as expired, keeping the store&apos;s coupon list
                    accurate and up-to-date.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-orange-500 font-black text-lg shrink-0">3</span>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Store page grows over time</h3>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Each store gets a dedicated page listing all its available discount codes, sorted by
                    community votes so the best deals are always at the top.
                  </p>
                </div>
              </li>
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}
