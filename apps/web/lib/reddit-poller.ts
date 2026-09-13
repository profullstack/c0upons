import 'server-only';
import { getDb } from './db';
import { syncRedditCouponcodes } from './reddit-sync';

export const DEFAULT_INTERVAL_MINUTES = 5;

const KEY = Symbol.for('c0upons.redditPoller');
type Holder = { timer?: ReturnType<typeof setInterval> };

/**
 * Read r/couponcodes every few minutes for as long as the server is up.
 *
 * "Every five minutes" is finer than GitHub's scheduler keeps (it delays and
 * drops runs), and c0upons has no worker process, so the web server polls
 * from inside itself: `instrumentation.ts` calls this once at boot. The timer
 * is unref'd so it never keeps a shutting-down process alive, and the handle
 * lives on a global symbol so a dev-server reload does not start a second one.
 * `REDDIT_SYNC_INTERVAL_MINUTES=0` turns it off.
 */
export function startRedditPoller(intervalMinutes = readInterval()): void {
  if (!intervalMinutes || intervalMinutes <= 0) return;
  const globals = globalThis as unknown as Record<symbol, Holder | undefined>;
  const holder = globals[KEY] ?? {};
  globals[KEY] = holder;
  if (holder.timer) return;

  const tick = async () => {
    try {
      const r = await syncRedditCouponcodes(getDb());
      if (!r.skipped) {
        console.log(`[reddit] ${r.inserted} new, ${r.updated} updated, ${r.declined} declined of ${r.fetched} via ${r.via}`);
      }
    } catch (err) {
      console.error('[reddit] poll failed:', err instanceof Error ? err.message : err);
    }
  };
  const first = setTimeout(tick, 20_000);
  first.unref?.();
  holder.timer = setInterval(tick, intervalMinutes * 60_000);
  holder.timer.unref?.();
}

export function readInterval(): number {
  const raw = process.env.REDDIT_SYNC_INTERVAL_MINUTES;
  if (raw === undefined || raw === '') return DEFAULT_INTERVAL_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_INTERVAL_MINUTES;
}
