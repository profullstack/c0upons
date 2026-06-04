import CouponCard from '@/components/CouponCard';
import StoreCard from '@/components/StoreCard';
import { Coupon, Store } from '@/lib/types';

interface StoreWithCount extends Store {
  coupon_count: number;
}

async function getTrendingCoupons(): Promise<Coupon[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/coupons?limit=12`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return res.json();
}

async function getTopStores(): Promise<StoreWithCount[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/stores`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const stores: StoreWithCount[] = await res.json();
  return stores.slice(0, 12);
}

export default async function HomePage() {
  const [coupons, stores] = await Promise.all([getTrendingCoupons(), getTopStores()]);

  return (
    <div className="flex flex-col gap-12">
      <section className="text-center py-8">
        <h1 className="text-4xl font-black text-gray-900">
          Community Coupon Codes
        </h1>
        <p className="mt-2 text-gray-500 text-lg">
          Find and share the best deals — updated daily by the community.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-4">Trending Coupons</h2>
        {coupons.length === 0 ? (
          <p className="text-gray-400">No coupons yet. Be the first to submit one!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {coupons.map((c) => (
              <CouponCard key={c.id} coupon={c} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Top Stores</h2>
          <a href="/stores" className="text-sm text-orange-500 hover:underline">
            View all →
          </a>
        </div>
        {stores.length === 0 ? (
          <p className="text-gray-400">No stores yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {stores.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
