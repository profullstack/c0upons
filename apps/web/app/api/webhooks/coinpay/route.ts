import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const RAW_SECRET = process.env.COINPAY_WEBHOOK_SECRET!;
// CoinPay signs with the bare hex key — strip the "whsecret_" prefix if present
const WEBHOOK_SECRET = RAW_SECRET?.replace(/^whsecret_/, '') ?? RAW_SECRET;

function verifySignature(raw: string, header: string): boolean {
  const parts: Record<string, string> = {};
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx !== -1) parts[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  const { t, v1 } = parts;
  if (!t || !v1) {
    console.error('CoinPay webhook: missing t or v1 in signature header', header);
    return false;
  }

  const age = Math.floor(Date.now() / 1000) - parseInt(t, 10);
  if (Math.abs(age) > 300) {
    console.error('CoinPay webhook: timestamp too old, age =', age);
    return false;
  }

  const payload = `${t}.${raw}`;
  const computed = createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  console.log('CoinPay webhook sig check — received:', v1.slice(0, 12), 'computed:', computed.slice(0, 12));

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
