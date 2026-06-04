import Link from 'next/link';
import Image from 'next/image';
import { Store } from '@/lib/types';

interface StoreWithCount extends Store {
  coupon_count: number;
}

export default function StoreCard({ store }: { store: StoreWithCount }) {
  return (
    <Link
      href={`/stores/${store.slug}`}
      className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 hover:shadow-md hover:border-orange-300 transition-all text-center"
    >
      {store.logo_url ? (
        <Image
          src={store.logo_url}
          alt={store.name}
          width={56}
          height={56}
          className="rounded object-contain"
        />
      ) : (
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-xl font-bold">
          {store.name[0]}
        </div>
      )}
      <span className="font-semibold text-gray-800 text-sm">{store.name}</span>
      <span className="text-xs text-gray-400">{store.coupon_count} coupons</span>
    </Link>
  );
}
