import CouponCard from '@/components/CouponCard';
import SearchBar from '@/components/SearchBar';
import { getDb } from '@/lib/db';
import { Coupon } from '@/lib/types';

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

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const results = q ? await search(q) : [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-black text-gray-900 mb-4">Search Coupons</h1>
        <SearchBar defaultValue={q} />
      </div>

      {q && (
        <div>
          <p className="text-gray-500 mb-4">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
          </p>
          {results.length === 0 ? (
            <p className="text-gray-400">No coupons found. Try a different search term.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map((c) => (
                <CouponCard key={c.id} coupon={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
