import 'server-only';
import { getDb } from './db';
import { syncFlippWeeklyAds } from './flipp-sync';

export const DEFAULT_INTERVAL_MINUTES = 5;

const KEY = Symbol.for('c0upons.flippPoller');
type Holder = { timer?: ReturnType<typeof setInterval> };

/**
 * Read the grocery weekly ads a few flyers at a time for as long as the
 * server is up, the same way the r/couponcodes poller works (see
 * reddit-poller.ts for why it lives in the web process). A new week's
 * circulars land within a few hours of going live.
 * `GROCERY_SYNC_INTERVAL_MINUTES=0` turns it off.
 */
export function startFlippPoller(intervalMinutes = readInterval()): void {
  if (!intervalMinutes || intervalMinutes <= 0) return;
  const globals = globalThis as unknown as Record<symbol, Holder | undefined>;
  const holder = globals[KEY] ?? {};
  globals[KEY] = holder;
  if (holder.timer) return;

  const tick = async () => {
    try {
      const r = await syncFlippWeeklyAds(getDb());
      if (!r.skipped && (r.written || r.pruned)) {
        const read = r.flyers.map((f) => `${f.store} ${f.written}`).join(', ');
        console.log(`[grocery] ${r.written} written (${read}), ${r.pruned} expired removed, ${r.remaining} flyers left`);
      }
    } catch (err) {
      console.error('[grocery] poll failed:', err instanceof Error ? err.message : err);
    }
  };
  const first = setTimeout(tick, 60_000);
  first.unref?.();
  holder.timer = setInterval(tick, intervalMinutes * 60_000);
  holder.timer.unref?.();
}

export function readInterval(): number {
  const raw = process.env.GROCERY_SYNC_INTERVAL_MINUTES;
  if (raw === undefined || raw === '') return DEFAULT_INTERVAL_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_INTERVAL_MINUTES;
}
