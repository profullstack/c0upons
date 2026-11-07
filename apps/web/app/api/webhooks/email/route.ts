import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from '@profullstack/ai-providers';
import { getDb } from '@/lib/db';
import { loadRootEnv } from '@/lib/root-env';
import { postCouponsToBbs } from '@/lib/bbs-post';
import {
  MODEL,
  handleInboundEmail,
  recentInbound,
  safeEqual,
  verifySignature,
  type InboundMail,
  type JsonModel,
} from '@/lib/inbound-email';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * coupons@profullstack.com, delivered by Forward Email.
 *
 * The alias's recipient is this URL with `?key=<INBOUND_EMAIL_SECRET>`.
 * When FORWARDEMAIL_WEBHOOK_KEY (the account's "Webhook Signature Payload
 * Verification Key") is set, a valid `X-Webhook-Signature` is accepted too.
 * Anything else is a 401: the body decides what gets posted to the site.
 *
 * A handled message, posted or skipped, answers 200 so Forward Email stops
 * retrying; only a failure answers 500, and the retry is safe because a
 * message is processed once by its Message-ID.
 *
 * GET with `Authorization: Bearer <INBOUND_EMAIL_SECRET>` lists the log
 * (`?limit=`, newest first); `c0upons inbox` reads it.
 */

loadRootEnv();

function keyOk(req: NextRequest): boolean {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  const candidates = [
    new URL(req.url).searchParams.get('key') ?? '',
    auth.startsWith('Bearer ') ? auth.slice(7).trim() : '',
  ];
  return candidates.some((c) => c && safeEqual(c, secret));
}

/**
 * Offers model: c0mpute first (@profullstack/ai-providers), Anthropic/OpenAI
 * as paid fallbacks; the router parks a provider that is out of credit. Any
 * failure falls back to the rules in extractOffers.
 *
 * Kept under the route's maxDuration so Forward Email gets its answer (and
 * does not retry) even when every peer node is slow: then the rules decide.
 */
const EMAIL_MODEL_TIMEOUT_MS = 90_000;

const jsonModel: JsonModel = async (prompt, schema) => {
  const { object } = await generateObject({
    feature: 'c0upons.inbound-email',
    name: 'Offers',
    maxTokens: 2048,
    temperature: 0,
    timeoutMs: EMAIL_MODEL_TIMEOUT_MS,
    models: { anthropic: MODEL },
    jsonSchema: schema as Record<string, unknown>,
    user: prompt,
  });
  return object;
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signed = verifySignature(raw, req.headers.get('x-webhook-signature'), process.env.FORWARDEMAIL_WEBHOOK_KEY);
  if (!signed && !keyOk(req)) {
    console.error('inbound email: unauthorized');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let mail: InboundMail;
  try {
    mail = JSON.parse(raw) as InboundMail;
  } catch {
    return NextResponse.json({ error: 'body is not JSON' }, { status: 400 });
  }

  try {
    const result = await handleInboundEmail(getDb(), mail, { model: jsonModel });
    console.log(
      `inbound email: ${result.outcome} from=${mail.from?.value?.[0]?.address ?? '?'} posted=${result.posted.length}`,
    );
    // Each new coupon also gets a thread on c0upons.com/bbs. Not awaited: the
    // board's flood guard spaces posts 16 s apart, and Forward Email should not
    // wait on that. This server is long-lived (dev2), so the promise finishes.
    if (result.created.length) {
      void postCouponsToBbs(getDb(), result.created)
        .then((posts) => {
          for (const p of posts) console.log(`bbs post: coupon ${p.coupon_id} -> ${p.forum} ${p.status} ${p.url ?? p.error ?? ''}`);
        })
        .catch((err) => console.error('bbs post failed:', err));
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('inbound email failed:', err);
    return NextResponse.json({ error: 'failed to process message' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!keyOk(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 50);
  const rows = await recentInbound(getDb(), limit);
  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
}
