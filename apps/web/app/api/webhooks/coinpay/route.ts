import { NextRequest, NextResponse } from 'next/server';
import { verifyCoinPayWebhook } from '@profullstack/stack/coinpay';

const SECRET = process.env.COINPAY_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sigHeader = req.headers.get('x-coinpay-signature');

  if (!verifyCoinPayWebhook({ signature: sigHeader, rawBody: raw, secret: SECRET })) {
    console.error('CoinPay webhook: invalid signature');
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(raw);
  console.log('CoinPay webhook:', event.type, event.id);

  switch (event.type) {
    case 'test.webhook':
      break;
    case 'payment.completed':
    case 'payment.confirmed': {
      const meta = event.data?.metadata ?? event.metadata ?? {};
      if (meta.type === 'bounty_fund' && meta.bounty_id) {
        const db = (await import('@/lib/db')).getDb();
        await db.sql`
          UPDATE bounties
          SET status = 'funded', payment_id = ${event.data?.payment_id ?? event.id},
              updated_at = ${new Date().toISOString()}
          WHERE public_id = ${meta.bounty_id} AND status = 'open'
        `;
        console.log('Bounty funded:', meta.bounty_id);
      }
      break;
    }
    case 'payment.failed':
      break;
  }

  return NextResponse.json({ received: true });
}
