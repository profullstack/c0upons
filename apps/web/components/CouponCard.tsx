import Link from 'next/link';
import Image from 'next/image';
import CopyButton from './CopyButton';
import VoteButton from './VoteButton';
import { Coupon } from '@/lib/types';

export default function CouponCard({ coupon }: { coupon: Coupon }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        {coupon.store_logo ? (
          <Image
            src={coupon.store_logo}
            alt={coupon.store_name ?? ''}
            width={40}
            height={40}
            className="rounded object-contain"
          />
        ) : (
          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs font-bold">
            {coupon.store_name?.[0]}
          </div>
        )}
        <div>
          <Link
            href={`/stores/${coupon.store_slug}`}
            className="text-sm font-medium text-gray-700 hover:text-orange-500"
          >
            {coupon.store_name}
          </Link>
          {coupon.verified === 1 && (
            <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
              Verified
            </span>
          )}
        </div>
        {coupon.discount && (
          <span className="ml-auto bg-orange-100 text-orange-600 font-bold text-sm px-2 py-1 rounded-lg">
            {coupon.discount}
          </span>
        )}
      </div>

      <div>
        <Link href={`/coupons/${coupon.id}`}>
          <h3 className="font-semibold text-gray-900 hover:text-orange-500 transition-colors">
            {coupon.title}
          </h3>
        </Link>
        {coupon.description && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{coupon.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-auto">
        {coupon.code ? (
          <CopyButton code={coupon.code} />
        ) : (
          <a
            href={coupon.url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Get Deal
          </a>
        )}
        <VoteButton couponId={coupon.id} initialVotes={coupon.votes} />
      </div>

      {coupon.expiry_date && (
        <p className="text-xs text-gray-400">Expires {coupon.expiry_date}</p>
      )}
    </div>
  );
}
