import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const RAW_SECRET = process.env.COINPAY_WEBHOOK_SECRET!;
const HEX_SECRET = RAW_SECRET?.replace(/^whsecret_/, '') ?? RAW_SECRET;

function hmac(key: string | Buffer, payload: string): string {
  return createHmac('sha256', key).update(payload).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

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

  const payloadWithTs = `${t}.${raw}`;
  const payloadRaw = raw;

  // Try every reasonable combination and log results
  const attempts = [
    { label: 'hex_str+ts',  key: HEX_SECRET,                        payload: payloadWithTs },
    { label: 'hex_bin+ts',  key: Buffer.from(HEX_SECRET, 'hex'),    payload: payloadWithTs },
    { label: 'full_str+ts', key: RAW_SECRET,                        payload: payloadWithTs },
    { label: 'hex_str_raw', key: HEX_SECRET,                        payload: payloadRaw    },
    { label: 'hex_bin_raw', key: Buffer.from(HEX_SECRET, 'hex'),    payload: payloadRaw    },
    { label: 'full_str_raw',key: RAW_SECRET,                        payload: payloadRaw    },
  ];

  for (const { label, key, payload } of attempts) {
    const computed = hmac(key, payload);
    const match = safeEqual(v1, computed);
    console.log(`CoinPay sig [${label}]: recv=${v1.slice(0,8)} calc=${computed.slice(0,8)} match=${match}`);
    if (match) return true;
  }

  return false;
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
      break;
    case 'payment.failed':
      break;
  }

  return NextResponse.json({ received: true });
}
