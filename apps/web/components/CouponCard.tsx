import Link from 'next/link';
import Image from 'next/image';
import CopyButton from './CopyButton';
import VoteButton from './VoteButton';
import { Coupon } from '@/lib/types';

export default function CouponCard({ coupon }: { coupon: Coupon }) {
  return (
    <div className="group bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-50 transition-all">
      {/* Store row */}
      <div className="flex items-center gap-2.5">
        {coupon.store_logo ? (
          <Image
            src={coupon.store_logo}
            alt={coupon.store_name ?? ''}
            width={32}
            height={32}
            className="rounded-lg object-contain border border-slate-100"
          />
        ) : (
          <div className="w-8 h-8 bg-orange-50 border border-orange-100 rounded-lg flex items-center justify-center text-orange-500 text-xs font-black shrink-0">
            {coupon.store_name?.[0]}
          </div>
        )}
        <Link
          href={`/stores/${coupon.store_slug}`}
          className="text-xs font-semibold text-slate-500 hover:text-orange-500 transition-colors truncate"
        >
          {coupon.store_name}
        </Link>
        {coupon.verified === 1 && (
          <span className="ml-auto shrink-0 text-xs bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full font-medium">
            ✓ Verified
          </span>
        )}
      </div>

      {/* Title */}
      <div className="flex-1">
        <Link href={`/coupons/${coupon.id}`}>
          <h3 className="font-semibold text-slate-900 text-sm leading-snug hover:text-orange-500 transition-colors line-clamp-2">
            {coupon.title}
          </h3>
        </Link>
        {coupon.description && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{coupon.description}</p>
        )}
      </div>

      {/* Discount badge */}
      {coupon.discount && (
        <div className="inline-flex">
          <span className="bg-orange-500 text-white font-black text-sm px-2.5 py-1 rounded-lg">
            {coupon.discount}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-auto pt-1 border-t border-slate-100">
        <div className="flex-1 min-w-0">
          {coupon.code ? (
            <CopyButton code={coupon.code} />
          ) : (
            <a
              href={coupon.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
            >
              Get Deal ↗
            </a>
          )}
        </div>
        <VoteButton couponId={coupon.id} initialVotes={coupon.votes} />
      </div>

      {coupon.expiry_date && (
        <p className="text-xs text-slate-400">Expires {coupon.expiry_date}</p>
      )}
    </div>
  );
}
