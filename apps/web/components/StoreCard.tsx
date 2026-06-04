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
      className="group bg-white border border-slate-200 rounded-xl p-4 flex flex-col items-center gap-2.5 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-50 transition-all text-center"
    >
      {store.logo_url ? (
        <Image
          src={store.logo_url}
          alt={store.name}
          width={48}
          height={48}
          className="rounded-xl object-contain border border-slate-100"
        />
      ) : (
        <div className="w-12 h-12 bg-orange-50 border border-orange-100 rounded-xl flex items-center justify-center text-orange-500 font-black text-lg">
          {store.name[0]}
        </div>
      )}
      <span className="font-semibold text-slate-800 text-sm leading-tight group-hover:text-orange-500 transition-colors">
        {store.name}
      </span>
      <span className="text-xs text-slate-400">
        {store.coupon_count} {store.coupon_count === 1 ? 'coupon' : 'coupons'}
      </span>
    </Link>
  );
}
