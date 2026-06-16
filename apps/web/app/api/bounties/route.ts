import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionDid } from '@/lib/auth';
import { generatePublicId } from '@/lib/id';

const COINPAY_BASE = 'https://coinpayportal.com';
const API_KEY = process.env.COINPAY_API_KEY!;
const MERCHANT_ID = process.env.COINPAY_MERCHANT_ID!;
const APP_URL = process.env.NEXT_PUBLIC_BASE_URL!;

export async function GET() {
  try {
    const db = getDb();
    const bounties = await db.sql`
      SELECT b.*, COALESCE(s.name, b.store_name) AS display_store
      FROM bounties b
      LEFT JOIN stores s ON s.id = b.store_id
      WHERE b.status IN ('open', 'funded')
      ORDER BY b.reward_usd DESC, b.created_at DESC
      LIMIT 50
    `;
    return NextResponse.json(bounties);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch bounties' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const did = await getSessionDid();
  if (!did) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { title, description, reward_usd, store_id, store_name } = await req.json();

  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  const reward = parseFloat(reward_usd);
  if (isNaN(reward) || reward < 0.10) return NextResponse.json({ error: 'Minimum reward is $0.10' }, { status: 400 });
  if (!store_id && !store_name?.trim()) return NextResponse.json({ error: 'Store is required' }, { status: 400 });

  try {
    const db = getDb();
    const publicId = generatePublicId();

    // Insert bounty as 'open' with a non-sequential public id for URLs.
    await db.sql`
      INSERT INTO bounties (public_id, creator_did, store_id, store_name, title, description, reward_usd, status)
      VALUES (
        ${publicId},
        ${did},
        ${store_id ?? null},
        ${store_name?.trim() ?? null},
        ${title.trim()},
        ${description?.trim() ?? null},
        ${reward},
        'open'
      )
    `;

    // Create a CoinPay payment for the creator to fund the bounty
    // Docs: POST /api/payments/create
    let paymentAddress: string | null = null;
    let paymentId: string | null = null;

    try {
      const res = await fetch(`${COINPAY_BASE}/api/payments/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          business_id: MERCHANT_ID,
          amount_usd: reward,
          currency: 'usdc_pol',   // default to USDC on Polygon — low fees
          description: `Coupon bounty: ${title.trim()}`,
          redirect_url: `${APP_URL}/bounties/${publicId}?funded=1`,
          metadata: { type: 'bounty_fund', bounty_id: publicId, creator_did: did },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        paymentId = data.payment_id ?? data.id ?? null;
        paymentAddress = data.payment_address ?? null;
        if (paymentId) {
          await db.sql`UPDATE bounties SET payment_id = ${paymentId} WHERE public_id = ${publicId}`;
        }
      } else {
        const err = await res.text();
        console.error('CoinPay payment create error:', err);
      }
    } catch (e) {
      console.error('CoinPay payment create failed:', e);
    }

    return NextResponse.json({
      id: publicId,
      public_id: publicId,
      payment_id: paymentId,
      payment_address: paymentAddress,
      pay_url: paymentId ? `${COINPAY_BASE}/pay/${paymentId}` : null,
    }, { status: 201 });
  } catch (e) {
    console.error('Failed to create bounty:', e);
    return NextResponse.json({ error: 'Failed to create bounty. Please try again.' }, { status: 500 });
  }
}
