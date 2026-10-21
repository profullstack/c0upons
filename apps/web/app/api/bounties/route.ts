import { NextRequest, NextResponse } from 'next/server';
import { createCoinPayClient } from '@profullstack/stack/coinpay';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { getSessionDid } from '@/lib/auth';
import { generatePublicId } from '@/lib/id';
import { memberByDid } from '@/lib/members';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COINPAY_BASE = 'https://coinpayportal.com';
const API_KEY = process.env.COINPAY_API_KEY!;
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
    return dbErrorResponse(e, 'Failed to fetch bounties');
  }
}

export async function POST(req: NextRequest) {
  const did = await getSessionDid();
  if (!did) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { title, description, url, reward_usd, store_id, store_name, email: bodyEmail } = await req.json();

  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  const reward = parseFloat(reward_usd);
  if (isNaN(reward) || reward < 0.10) return NextResponse.json({ error: 'Minimum reward is $0.10' }, { status: 400 });
  if (!store_id && !store_name?.trim()) return NextResponse.json({ error: 'Store is required' }, { status: 400 });

  // CoinPay checkout sessions need the payer's email: the one on file from
  // the CoinPay login, else the one typed on the form.
  let email = '';
  try {
    email = (await memberByDid(did))?.email?.trim().toLowerCase() ?? '';
  } catch { /* members table unavailable: fall back to the form */ }
  if (!email && typeof bodyEmail === 'string') email = bodyEmail.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 320) {
    return NextResponse.json({ error: 'A valid email is required to fund the bounty' }, { status: 400 });
  }

  try {
    const db = getDb();
    const publicId = generatePublicId();

    // Insert bounty as 'open' with a non-sequential public id for URLs.
    await db.sql`
      INSERT INTO bounties (public_id, creator_did, store_id, store_name, title, description, url, reward_usd, status)
      VALUES (
        ${publicId},
        ${did},
        ${store_id ?? null},
        ${store_name?.trim() ?? null},
        ${title.trim()},
        ${description?.trim() ?? null},
        ${url?.trim() || null},
        ${reward},
        'open'
      )
    `;

    // Hosted CoinPay checkout session: the creator funds the bounty with any
    // coin the business has a wallet for, or PayPal. payment_id holds the
    // cs_ session id until the webhook replaces it with the paid payment id.
    let payUrl: string | null = null;
    let sessionId: string | null = null;

    try {
      const coinpay = createCoinPayClient({ apiKey: API_KEY, baseUrl: COINPAY_BASE });
      const checkout = await coinpay.createCheckout({
        amountUsd: reward,
        customerEmail: email,
        accountId: did,
        property: 'c0upons.com',
        description: `Coupon bounty: ${title.trim()}`.slice(0, 500),
        successUrl: `${APP_URL}/bounties/${publicId}?funded=1`,
        cancelUrl: `${APP_URL}/bounties/${publicId}`,
        metadata: { type: 'bounty_fund', bounty_id: publicId, creator_did: did },
      });
      sessionId = checkout.sessionId;
      payUrl = checkout.checkoutUrl;
      await db.sql`UPDATE bounties SET payment_id = ${sessionId} WHERE public_id = ${publicId}`;
    } catch (e) {
      console.error('CoinPay checkout session create failed:', e);
    }

    return NextResponse.json({
      id: publicId,
      public_id: publicId,
      checkout_session_id: sessionId,
      pay_url: payUrl,
    }, { status: 201 });
  } catch (e) {
    console.error('Failed to create bounty:', e);
    return dbErrorResponse(e, 'Failed to create bounty. Please try again.');
  }
}
