import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSessionDid } from '@/lib/auth';

const COINPAY_BASE = 'https://coinpayportal.com';
const API_KEY = process.env.COINPAY_API_KEY!;
const MERCHANT_ID = process.env.COINPAY_MERCHANT_ID!;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const did = await getSessionDid();
  if (!did) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { id } = await params;
  const { coupon_id } = await req.json();
  if (!coupon_id) return NextResponse.json({ error: 'coupon_id is required' }, { status: 400 });

  const db = getDb();
  const rows = await db.sql`SELECT * FROM bounties WHERE public_id = ${id}`;
  if (!rows.length) return NextResponse.json({ error: 'Bounty not found' }, { status: 404 });
  const bounty = rows[0];
  const bountyId = bounty.id;

  if (!['open', 'funded'].includes(bounty.status)) {
    return NextResponse.json({ error: `Bounty is already ${bounty.status}` }, { status: 409 });
  }
  if (bounty.creator_did === did) {
    return NextResponse.json({ error: 'Cannot claim your own bounty' }, { status: 400 });
  }

  const coupons = await db.sql`SELECT * FROM coupons WHERE id = ${coupon_id}`;
  if (!coupons.length) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
  const coupon = coupons[0];

  // The submitted coupon must actually be for the store this bounty targets,
  // otherwise any unrelated coupon would satisfy the claim and trigger a payout.
  // A bounty targets either a canonical store_id or a free-text store_name.
  let couponStoreName: string | null = null;
  if (coupon.store_id) {
    const s = await db.sql`SELECT name FROM stores WHERE id = ${coupon.store_id}`;
    couponStoreName = s.length ? s[0].name : null;
  }
  const storeMatches = bounty.store_id
    ? coupon.store_id === bounty.store_id
    : !!bounty.store_name &&
      !!couponStoreName &&
      couponStoreName.trim().toLowerCase() === bounty.store_name.trim().toLowerCase();
  if (!storeMatches) {
    return NextResponse.json({ error: 'Coupon does not match the bounty store' }, { status: 400 });
  }

  // A coupon may only be used to claim one bounty — otherwise a single coupon
  // could be reused to drain the reward of every bounty for that store.
  const alreadyUsed = await db.sql`
    SELECT 1 FROM bounties WHERE coupon_id = ${coupon_id} AND id != ${bountyId} LIMIT 1
  `;
  if (alreadyUsed.length) {
    return NextResponse.json({ error: 'This coupon has already been used to claim a bounty' }, { status: 409 });
  }

  // Mark bounty as claimed — atomic WHERE prevents race conditions
  await db.sql`
    UPDATE bounties
    SET status = 'claimed', coupon_id = ${coupon_id}, claimer_did = ${did},
        updated_at = ${new Date().toISOString()}
    WHERE id = ${bountyId} AND status IN ('open', 'funded')
  `;

  // Verify the claim succeeded (handles concurrent claim race)
  const verify = await db.sql`SELECT claimer_did FROM bounties WHERE id = ${bountyId}`;
  if (verify.length && verify[0].claimer_did !== did) {
    return NextResponse.json({ error: 'Bounty was already claimed by another user' }, { status: 409 });
  }

  // Attempt payout to claimer via web wallet
  // Docs: POST /api/web-wallet/:id/prepare-tx then /broadcast
  let payoutOk = false;
  try {
    // Get claimer's wallet address from DID reputation endpoint
    const didRes = await fetch(`${COINPAY_BASE}/api/reputation/agent/${encodeURIComponent(did)}/reputation`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    let recipientAddress: string | null = null;
    if (didRes.ok) {
      const didData = await didRes.json();
      recipientAddress = didData.wallet_address ?? didData.address ?? null;
    }

    if (recipientAddress) {
      // Prepare transaction from merchant web wallet
      const prepareRes = await fetch(`${COINPAY_BASE}/api/web-wallet/${MERCHANT_ID}/prepare-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          to: recipientAddress,
          amount_usd: bounty.reward_usd,
          currency: 'usdc_pol',
          description: `Bounty payout: ${bounty.title}`,
          metadata: { type: 'bounty_payout', bounty_id: bountyId, claimer_did: did },
        }),
      });

      if (prepareRes.ok) {
        const tx = await prepareRes.json();
        // Broadcast the transaction
        const broadcastRes = await fetch(`${COINPAY_BASE}/api/web-wallet/${MERCHANT_ID}/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ tx_id: tx.tx_id }),
        });
        payoutOk = broadcastRes.ok;
      }
    }

    if (payoutOk) {
      await db.sql`
        UPDATE bounties SET status = 'paid', updated_at = ${new Date().toISOString()}
        WHERE id = ${bountyId}
      `;
    }
  } catch (e) {
    console.error('CoinPay payout failed:', e);
  }

  return NextResponse.json({
    claimed: true,
    payout_initiated: payoutOk,
    message: payoutOk
      ? 'Bounty claimed and payment sent to your CoinPay wallet!'
      : 'Bounty claimed! Payment will be processed shortly.',
  });
}
