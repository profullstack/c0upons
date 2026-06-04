import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_SECRET = process.env.COINPAY_WEBHOOK_SECRET!;

async function verifySignature(raw: string, header: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const { t, v1 } = parts;
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const payload = `${t}.${raw}`;
  const sig = Uint8Array.from(v1.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
  return crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(payload));
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sigHeader = req.headers.get('x-coinpay-signature') ?? '';

  const valid = await verifySignature(raw, sigHeader);
  if (!valid) {
    console.error('CoinPay webhook: invalid signature');
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(raw);
  console.log('CoinPay webhook:', event.type, event.id);

  switch (event.type) {
    case 'test.webhook':
      break;
    case 'payment.completed':
    case 'payment.confirmed':
      // TODO: fulfill order for event.data.payment_id
      break;
    case 'payment.failed':
      break;
  }

  return NextResponse.json({ received: true });
}
