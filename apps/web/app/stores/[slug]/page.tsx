import { notFound } from 'next/navigation';
import Image from 'next/image';
import CouponCard from '@/components/CouponCard';
import { Coupon, Store } from '@/lib/types';

async function getStore(slug: string): Promise<{ store: Store; coupons: Coupon[] } | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/stores/${slug}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
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
