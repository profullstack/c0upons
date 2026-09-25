import { ImageResponse } from 'next/og';
import { getCoupon } from './coupon';
import { truncate } from '@/lib/coupon-seo';

// Node runtime, not edge: this reads the coupon from Turso through the same
// server-only handle the page uses.
export const alt = 'Coupon on c0upons';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const coupon = await getCoupon(id);

  const store = coupon?.store_name?.trim() || 'c0upons';
  const title = coupon ? truncate(coupon.title, 88) : 'Community Coupon Codes & Deals';
  const discount = coupon?.discount?.trim() || null;
  const code = coupon?.code?.trim() || null;

  return new ImageResponse(
    (
      <div
        style={{
          background: '#ffffff',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px 72px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: '#f97316' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#374151' }}>{store}</div>
          {discount && (
            // One interpolated string, not `{discount} off`: Satori treats the
            // latter as two child nodes and refuses a div without an explicit
            // display, which fails the whole image.
            <div
              style={{
                display: 'flex',
                fontSize: 34,
                fontWeight: 900,
                color: '#f97316',
                background: '#ffedd5',
                padding: '6px 20px',
                borderRadius: 12,
              }}
            >
              {`${discount} off`}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', fontSize: 56, fontWeight: 900, color: '#111827', lineHeight: 1.15, marginTop: 28 }}>
          {title}
        </div>

        {code && (
          <div
            style={{
              display: 'flex',
              // A flex column stretches its children, which would leave the
              // code rattling around in a full-width box.
              alignSelf: 'flex-start',
              marginTop: 32,
              fontSize: 40,
              fontWeight: 700,
              color: '#111827',
              border: '4px dashed #f97316',
              borderRadius: 16,
              padding: '14px 32px',
              letterSpacing: 2,
            }}
          >
            {code}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 56,
            left: 72,
            fontSize: 30,
            fontWeight: 900,
            color: '#f97316',
          }}
        >
          c0upons.com
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 12, background: '#f97316' }} />
      </div>
    ),
    { ...size }
  );
}
