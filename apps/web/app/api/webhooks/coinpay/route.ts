import { NextRequest, NextResponse } from 'next/server';
import { verifyAndReadCoinPayWebhook } from '@profullstack/stack/coinpay';

const SECRET = process.env.COINPAY_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const hook = verifyAndReadCoinPayWebhook({
    signature: req.headers.get('x-coinpay-signature'),
    rawBody: raw,
    secret: SECRET,
  });
  if (!hook) {
    console.error('CoinPay webhook: invalid signature or payload');
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  console.log('CoinPay webhook:', hook.type, hook.paymentId, hook.checkoutSessionId ?? '-');

  if (hook.paid) {
    const meta = hook.metadata;
    const bountyId = typeof meta.bounty_id === 'string' ? meta.bounty_id : null;
    if (meta.type === 'bounty_fund' && bountyId) {
      const db = (await import('@/lib/db')).getDb();
      await db.sql`
        UPDATE bounties
        SET status = 'funded', payment_id = ${hook.paymentId ?? hook.checkoutSessionId},
            updated_at = ${new Date().toISOString()}
        WHERE public_id = ${bountyId} AND status = 'open'
      `;
      console.log('Bounty funded:', bountyId, hook.rail);
    }
  }

  return NextResponse.json({ received: true });
}
