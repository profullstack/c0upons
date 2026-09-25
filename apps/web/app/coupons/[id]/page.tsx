export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import CopyButton from '@/components/CopyButton';
import RevealCode from '@/components/RevealCode';
import { getCoupon } from './coupon';
import { BASE, couponDescription, couponJsonLd, couponShareImage, couponTitle } from '@/lib/coupon-seo';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const coupon = await getCoupon(id);
  if (!coupon) {
    return { title: 'Coupon not found', robots: { index: false, follow: true } };
  }

  const url = `${BASE}/coupons/${coupon.id}`;
  const title = couponTitle(coupon);
  const description = couponDescription(coupon);
  const image = couponShareImage(coupon);

  return {
    title,
    description,
    // Without this every coupon page inherits the root layout's canonical and
    // tells Google it is a duplicate of the homepage.
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'c0upons',
      type: 'website',
      locale: 'en_US',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coupon = await getCoupon(id);
  if (!coupon) notFound();

  return (
    <div className="max-w-xl mx-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(couponJsonLd(coupon)) }}
      />

      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-400">
        <Link href="/" className="hover:text-orange-500">Home</Link>
        <span className="mx-1">/</span>
        <Link href="/stores" className="hover:text-orange-500">Stores</Link>
        {coupon.store_slug && (
          <>
            <span className="mx-1">/</span>
            <Link href={`/stores/${coupon.store_slug}`} className="hover:text-orange-500">
              {coupon.store_name}
            </Link>
          </>
        )}
      </nav>

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
            // No code on file: show the link now and have a browser read the
            // deal page for a hidden one (see /api/coupons/[id]/reveal).
            <RevealCode couponId={coupon.id} url={coupon.url} />
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
