export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import CouponCard from '@/components/CouponCard';
import SearchBar from '@/components/SearchBar';
import { getDb } from '@/lib/db';
import { Coupon } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Search Coupons',
  description:
    'Search thousands of community-submitted coupon codes and promo deals. Find discounts for any store — electronics, fashion, groceries, travel and more.',
  alternates: { canonical: 'https://c0upons.com/search' },
};

async function search(q: string): Promise<Coupon[]> {
  if (!q) return [];
  try {
    const db = getDb();
    const pattern = `%${q}%`;
    return await db.sql`
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
  } catch {
    return [];
  }
}

const SEARCH_TIPS = [
  { tip: 'Search by store name', example: '"Amazon", "Nike", "Spotify"' },
  { tip: 'Search by discount type', example: '"free shipping", "20% off", "BOGO"' },
  { tip: 'Search by product category', example: '"shoes", "electronics", "software"' },
  { tip: 'Search by coupon code', example: 'paste a code you already have to check it' },
];

const POPULAR_SEARCHES = [
  'free shipping',
  '20% off',
  'electronics',
  'fashion',
  'groceries',
  'travel',
  'software',
  'subscription',
];

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const results = q ? await search(q) : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-black text-gray-900 mb-4">Search Coupons</h1>
        <SearchBar defaultValue={q} />
      </div>

      {q ? (
        <div>
          <p className="text-gray-500 mb-4">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
          </p>
          {results.length === 0 ? (
            <div className="flex flex-col gap-8">
              <div className="text-center py-12 border border-dashed border-gray-200 rounded-2xl">
                <p className="text-gray-500 font-medium">No coupons found for &ldquo;{q}&rdquo;.</p>
                <p className="text-sm text-gray-400 mt-1 mb-5">
                  Try a different search term, or be the first to submit a coupon for this store.
                </p>
                <Link
                  href="/submit"
                  className="inline-flex bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Submit a coupon code
                </Link>
              </div>
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Try a popular search</h2>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SEARCHES.map((term) => (
                    <Link
                      key={term}
                      href={`/search?q=${encodeURIComponent(term)}`}
                      className="bg-gray-100 hover:bg-orange-100 hover:text-orange-700 text-gray-700 text-sm font-medium px-4 py-1.5 rounded-full transition-colors"
                    >
                      {term}
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map((c) => (
                <CouponCard key={c.id} coupon={c} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Landing state — shown when no query is present; must be content-rich for crawlers */
        <div className="flex flex-col gap-10">
          {/* Popular searches */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Popular searches</h2>
            <div className="flex flex-wrap gap-2">
              {POPULAR_SEARCHES.map((term) => (
                <Link
                  key={term}
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className="bg-gray-100 hover:bg-orange-100 hover:text-orange-700 text-gray-700 text-sm font-medium px-4 py-1.5 rounded-full transition-colors"
                >
                  {term}
                </Link>
              ))}
            </div>
          </section>

          {/* Search tips */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Search tips</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {SEARCH_TIPS.map(({ tip, example }) => (
                <div
                  key={tip}
                  className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-1"
                >
                  <span className="font-semibold text-gray-900 text-sm">{tip}</span>
                  <span className="text-xs text-gray-500">{example}</span>
                </div>
              ))}
            </div>
          </section>

          {/* About the search */}
          <section className="bg-orange-50 rounded-2xl p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-3">How c0upons search works</h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              c0upons searches across coupon titles, descriptions, store names, and coupon codes
              simultaneously. Results are ranked by community votes, so the most reliable, recently
              verified codes always appear first.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Can&apos;t find what you&apos;re looking for?{' '}
              <Link href="/submit" className="text-orange-600 hover:underline font-medium">
                Submit a coupon
              </Link>{' '}
              and help the community save, or post a{' '}
              <Link href="/bounties" className="text-orange-600 hover:underline font-medium">
                bounty
              </Link>{' '}
              and pay someone to find it for you.
            </p>
          </section>

          {/* Links to other sections */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Browse without searching</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <Link
                href="/stores"
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-orange-300 hover:shadow-md transition-all flex flex-col gap-1"
              >
                <span className="text-2xl">🏪</span>
                <span className="font-semibold text-gray-900 text-sm mt-1">Browse by store</span>
                <span className="text-xs text-gray-500">Find all coupons for a specific retailer</span>
              </Link>
              <Link
                href="/bounties"
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-orange-300 hover:shadow-md transition-all flex flex-col gap-1"
              >
                <span className="text-2xl">💰</span>
                <span className="font-semibold text-gray-900 text-sm mt-1">View bounties</span>
                <span className="text-xs text-gray-500">Earn rewards by hunting coupon codes</span>
              </Link>
              <Link
                href="/submit"
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-orange-300 hover:shadow-md transition-all flex flex-col gap-1"
              >
                <span className="text-2xl">➕</span>
                <span className="font-semibold text-gray-900 text-sm mt-1">Submit a coupon</span>
                <span className="text-xs text-gray-500">Share a working code with the community</span>
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
