import CouponCard from '@/components/CouponCard';
import SearchBar from '@/components/SearchBar';
import { Coupon } from '@/lib/types';

async function search(q: string): Promise<Coupon[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/search?q=${encodeURIComponent(q)}`,
    { cache: 'no-store' }
  );
  if (!res.ok) return [];
  return res.json();
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
