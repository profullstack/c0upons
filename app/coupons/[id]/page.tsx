import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import CopyButton from '@/components/CopyButton';
import { Coupon } from '@/lib/types';

async function getCoupon(id: string): Promise<Coupon | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'}/api/coupons/${id}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coupon = await getCoupon(id);
  if (!coupon) notFound();

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
          {coupon.store_logo ? (
            <Image src={coupon.store_logo} alt={coupon.store_name ?? ''} width={56} height={56} className="rounded object-contain" />
          ) : (
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-xl font-bold text-gray-400">
              {coupon.store_name?.[0]}
            </div>
          )}
          <div>
            <Link href={`/stores/${coupon.store_slug}`} className="font-semibold text-gray-700 hover:text-orange-500">
              {coupon.store_name}
            </Link>
            {coupon.verified === 1 && (
              <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Verified</span>
            )}
          </div>
          {coupon.discount && (
            <span className="ml-auto bg-orange-100 text-orange-600 font-bold text-lg px-3 py-1 rounded-lg">
              {coupon.discount}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">{coupon.title}</h1>
          {coupon.description && <p className="text-gray-500 mt-2">{coupon.description}</p>}
        </div>

        <div className="flex flex-col gap-3">
          {coupon.code ? (
            <CopyButton code={coupon.code} />
          ) : coupon.url ? (
            <a
              href={coupon.url}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg text-center transition-colors"
            >
              Get Deal
            </a>
          ) : null}

          {coupon.expiry_date && (
            <p className="text-sm text-gray-400">Expires: {coupon.expiry_date}</p>
          )}
          <p className="text-sm text-gray-400">{coupon.votes} people found this helpful</p>
        </div>

        <Link href={`/stores/${coupon.store_slug}`} className="text-sm text-orange-500 hover:underline">
          ← More coupons for {coupon.store_name}
        </Link>
      </div>
    </div>
  );
}
