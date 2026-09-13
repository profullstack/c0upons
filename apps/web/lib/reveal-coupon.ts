import Anthropic from '@anthropic-ai/sdk';
// Sibling imports carry their .ts extension because Node runs this file in
// the tests with its own type stripping, which never resolves a bare path.
import { ObscuraMcpClient } from './obscura-mcp.ts';
import { revealCode, withBrowserLock } from './reveal-code.ts';
import { revealCodeHeuristic } from './reveal-heuristic.ts';
import type { SqlDb } from './nichedb-sync.ts';

/**
 * Reveal a coupon's code and remember the answer: the one procedure behind
 * the coupon page's button, the sweep the schedule runs, and the CLI.
 *
 * The browser is required; the model is optional. When a key exists and is
 * not being refused, the model-driven shopper (reveal-code.ts) reads the
 * page; otherwise, or after a refusal, the scripted walk (reveal-heuristic.ts)
 * does. Either way the row records when it was last read, so a page with no
 * code is not read again for a day by the page and a week by the sweep.
 *
 * This file has no framework imports so the sweep can be exercised under
 * plain Node against a local libSQL file, the way the nichedb sync is.
 */

/** How long a "no code here" answer stands for a page view. */
export const RECHECK_HOURS = 24;
/** How long the sweep leaves a page alone after reading it. */
export const RESWEEP_DAYS = 7;

export interface RevealDeps {
  mcp: ObscuraMcpClient;
  anthropic: Anthropic | null;
}

let mcp: ObscuraMcpClient | null = null;
let anthropic: Anthropic | null = null;

/** The deployment's browser and, when a key exists, its model. Null without a browser. */
export function revealDeps(env: NodeJS.ProcessEnv = process.env): RevealDeps | null {
  const url = env.OBSCURA_MCP_URL;
  if (!url) return null;
  mcp ??= new ObscuraMcpClient(url);
  if (env.ANTHROPIC_API_KEY) anthropic ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 90_000 });
  return { mcp, anthropic: env.ANTHROPIC_API_KEY ? anthropic : null };
}

/*
 * When the model says no (the org's monthly usage cap, or a rate limit),
 * remember it for an hour so the next reveal goes straight to the walk
 * instead of opening a browser to be refused again.
 */
let modelBlockedUntil = 0;
const MODEL_BACKOFF_MS = 60 * 60_000;

export function modelRefused(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.BadRequestError && /usage limits/i.test(err.message)) return true;
  if (err instanceof Anthropic.AuthenticationError) return true;
  return false;
}

/** The columns reveal writes, created if the migration has not run. */
export async function ensureRevealColumns(db: SqlDb): Promise<void> {
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

export interface CouponToReveal {
  id: number;
  url: string;
  title: string;
  store_name?: string | null;
}

export interface RevealOutcome {
  id: number;
  code: string | null;
  method: string;
  engine: 'model' | 'heuristic';
  notes: string;
  checked_at: string;
}

/** Read one coupon's page, store what was found, and say what happened. */
export async function revealForCoupon(db: SqlDb, coupon: CouponToReveal, d: RevealDeps): Promise<RevealOutcome> {
  const result = await withBrowserLock(async () => {
    const input = { url: coupon.url, title: coupon.title, store: coupon.store_name };
    if (d.anthropic && Date.now() >= modelBlockedUntil) {
      try {
        const r = await revealCode(input, { mcp: d.mcp, anthropic: d.anthropic });
        return { ...r, engine: 'model' as const };
      } catch (err) {
        if (!modelRefused(err)) throw err;
        modelBlockedUntil = Date.now() + MODEL_BACKOFF_MS;
        console.error('model refused, reveal falls back to the heuristic for an hour:', (err as Error).message);
      }
    }
    const r = await revealCodeHeuristic(coupon.url, d.mcp);
    return { ...r, engine: 'heuristic' as const };
  });

  const now = new Date().toISOString();
  if (result.code) {
    await db.sql`
      UPDATE coupons SET code = ${result.code}, code_source = 'obscura', code_checked_at = ${now}
      WHERE id = ${coupon.id} AND code IS NULL
    `;
  } else {
    await db.sql`UPDATE coupons SET code_checked_at = ${now} WHERE id = ${coupon.id}`;
  }
  return { id: coupon.id, code: result.code, method: result.method, engine: result.engine, notes: result.notes, checked_at: now };
}

export interface SweepOptions {
  /** Coupons to read this run. */
  limit?: number;
  /** Stop starting new reads after this long, so a run fits its time budget. */
  maxMs?: number;
  now?: () => Date;
}

export interface SweepResult {
  ok: true;
  remaining: number;
  checked: RevealOutcome[];
  found: number;
}

/**
 * Work through the coupons that have no code and have not been read lately,
 * most-voted first, a few per run. Every coupon on the site gets read within
 * days of arriving, and a page that had nothing is left alone for a week.
 */
export async function sweepReveals(db: SqlDb, d: RevealDeps, opts: SweepOptions = {}): Promise<SweepResult> {
  const limit = opts.limit ?? 3;
  const maxMs = opts.maxMs ?? 150_000;
  const now = opts.now ?? (() => new Date());
  const started = now().getTime();
  await ensureRevealColumns(db);
  const cutoff = new Date(started - RESWEEP_DAYS * 86_400_000).toISOString();

  const candidates = (await db.sql`
    SELECT c.id, c.url, c.title, s.name AS store_name
    FROM coupons c JOIN stores s ON s.id = c.store_id
    WHERE c.code IS NULL AND c.url IS NOT NULL
      AND (c.code_checked_at IS NULL OR c.code_checked_at < ${cutoff})
    ORDER BY c.votes DESC, c.created_at DESC
    LIMIT ${limit}
  `) as CouponToReveal[];
  const [{ n }] = await db.sql`
    SELECT COUNT(*) AS n FROM coupons
    WHERE code IS NULL AND url IS NOT NULL AND (code_checked_at IS NULL OR code_checked_at < ${cutoff})
  `;

  const checked: RevealOutcome[] = [];
  for (const coupon of candidates) {
    if (now().getTime() - started > maxMs) break;
    try {
      checked.push(await revealForCoupon(db, coupon, d));
    } catch (err) {
      console.error(`reveal sweep: coupon ${coupon.id} failed:`, (err as Error).message);
      // Mark it read so one broken page cannot hold the front of the queue.
      await db.sql`UPDATE coupons SET code_checked_at = ${now().toISOString()} WHERE id = ${coupon.id}`;
    }
  }
  return {
    ok: true,
    remaining: Math.max(0, Number(n) - checked.length),
    checked,
    found: checked.filter((c) => c.code).length,
  };
}
