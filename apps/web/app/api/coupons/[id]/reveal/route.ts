import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { dbErrorResponse } from '@/lib/api-error';
import { loadRootEnv } from '@/lib/root-env';
import { ObscuraMcpClient } from '@/lib/obscura-mcp';
import { revealCode, withBrowserLock } from '@/lib/reveal-code';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/** How long a "no code here" answer stands before the page is read again. */
export const RECHECK_HOURS = 24;

let mcp: ObscuraMcpClient | null = null;
let anthropic: Anthropic | null = null;

/*
 * When the model says no (the org's monthly usage cap, or a rate limit), every
 * page view would otherwise open a browser and be refused again. Remember the
 * refusal for an hour and answer 503 at once; the page still shows the link.
 */
let modelBlockedUntil = 0;
const MODEL_BACKOFF_MS = 60 * 60_000;

function modelRefused(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.BadRequestError && /usage limits/i.test(err.message)) return true;
  if (err instanceof Anthropic.AuthenticationError) return true;
  return false;
}

function deps() {
  loadRootEnv();
  const url = process.env.OBSCURA_MCP_URL;
  if (!url) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  mcp ??= new ObscuraMcpClient(url);
  anthropic ??= new Anthropic({ timeout: 90_000 });
  return { mcp, anthropic };
}

/**
 * The two columns this route writes, created if the migration has not run.
 * ALTER TABLE has no IF NOT EXISTS in SQLite, so an existing column is known
 * by the error it raises.
 */
async function ensureColumns(db: ReturnType<typeof getDb>) {
  for (const stmt of [
    () => db.sql`ALTER TABLE coupons ADD COLUMN code_checked_at DATETIME`,
    () => db.sql`ALTER TABLE coupons ADD COLUMN code_source TEXT`,
  ]) {
    try {
      await stmt();
    } catch (err) {
      if (!/duplicate column/i.test(String((err as Error)?.message ?? err))) throw err;
    }
  }
}

/**
 * Reveal the code for one coupon by driving a browser through its deal page.
 *
 * Answers at once when the row already has a code, or when the page was read
 * within the last day and had none, so a busy coupon page costs one crawl a
 * day at most. Otherwise it runs the shopper agent (Obscura + Claude Haiku),
 * stores what it found, and answers with it. 503 when the deployment has no
 * Obscura relay or no Anthropic key, which is how local dev looks.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const couponId = Number.parseInt(id, 10);
  if (!Number.isFinite(couponId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  try {
    const db = getDb();
    await ensureColumns(db);
    const rows = await db.sql`
      SELECT c.id, c.code, c.url, c.title, c.code_checked_at, s.name AS store_name
      FROM coupons c JOIN stores s ON s.id = c.store_id
      WHERE c.id = ${couponId}
    `;
    if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const coupon = rows[0];
    if (coupon.code) return NextResponse.json({ code: coupon.code, cached: true });
    if (!coupon.url) return NextResponse.json({ code: null, reason: 'no page to read' });

    const checked = coupon.code_checked_at ? new Date(coupon.code_checked_at).getTime() : 0;
    if (checked && Date.now() - checked < RECHECK_HOURS * 3_600_000) {
      return NextResponse.json({ code: null, checked_at: coupon.code_checked_at, cached: true });
    }

    const d = deps();
    if (!d) return NextResponse.json({ error: 'code reveal is not configured' }, { status: 503 });
    if (Date.now() < modelBlockedUntil) {
      return NextResponse.json(
        { error: 'code reveal is paused: the model is unavailable' },
        { status: 503, headers: { 'Retry-After': '3600' } }
      );
    }

    let result;
    try {
      result = await withBrowserLock(() =>
        revealCode({ url: coupon.url, title: coupon.title, store: coupon.store_name }, d)
      );
    } catch (err) {
      if (modelRefused(err)) {
        modelBlockedUntil = Date.now() + MODEL_BACKOFF_MS;
        console.error('reveal paused for an hour, the model refused:', (err as Error).message);
        return NextResponse.json(
          { error: 'code reveal is paused: the model is unavailable' },
          { status: 503, headers: { 'Retry-After': '3600' } }
        );
      }
      throw err;
    }

    const now = new Date().toISOString();
    if (result.code) {
      await db.sql`
        UPDATE coupons SET code = ${result.code}, code_source = 'obscura', code_checked_at = ${now}
        WHERE id = ${couponId} AND code IS NULL
      `;
    } else {
      await db.sql`UPDATE coupons SET code_checked_at = ${now} WHERE id = ${couponId}`;
    }
    return NextResponse.json({
      code: result.code,
      method: result.method,
      notes: result.notes,
      checked_at: now,
    });
  } catch (err) {
    console.error('reveal failed:', err);
    return dbErrorResponse(err, 'code reveal failed');
  }
}
