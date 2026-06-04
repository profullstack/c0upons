import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_SECRET = process.env.COINPAY_WEBHOOK_SECRET!;

function verifySignature(raw: string, header: string): boolean {
  const parts: Record<string, string> = {};
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx !== -1) parts[part.slice(0, idx)] = part.slice(idx + 1);
  }
  const { t, v1 } = parts;
  if (!t || !v1) return false;

  const age = Math.floor(Date.now() / 1000) - parseInt(t, 10);
  if (Math.abs(age) > 300) return false;

  const computed = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${t}.${raw}`)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(computed, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sigHeader = req.headers.get('x-coinpay-signature') ?? '';

  if (!verifySignature(raw, sigHeader)) {
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
