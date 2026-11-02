import 'server-only';
import { createDaemon, type Daemon } from '@profullstack/scraper-daemon';
import { getDb } from './db';
import { syncPeerpushDeals, USER_AGENT } from './peerpush-sync';

/**
 * c0upons' scraper daemon (@profullstack/scraper-daemon, the house updater for
 * listing sites): BullMQ on c0upons' own Redis (REDIS_URL, the compose `redis`
 * service), run as a role of the web process, no new service or domain. The
 * listings stay in c0upons' own database; Redis only holds the queue and run
 * records. Without REDIS_URL the package's local engine runs the same jobs
 * in-process (dev, tests).
 *
 * Jobs:
 *   peerpush  daily  peerpush.com/deals -> coupons (lib/peerpush-sync.ts)
 *
 * The older sources (r/couponcodes, Flipp) still run on their own pollers.
 *
 * The package's watchdog exits the process when Redis stops answering, which
 * here would take the website down with it; instead the daemon is stopped and
 * rebuilt on a fresh connection a few minutes later.
 */

const KEY = Symbol.for('c0upons.scraperDaemon');
type Holder = { daemon?: Daemon; retry?: ReturnType<typeof setTimeout> };
const holder = (): Holder => {
  const g = globalThis as unknown as Record<symbol, Holder | undefined>;
  return (g[KEY] ??= {});
};

const RETRY_MS = 5 * 60_000;

function build(): Daemon {
  const daemon = createDaemon({
    name: 'c0upons',
    redis: process.env.REDIS_URL || null,
    concurrency: 2,
    fetch: { userAgent: USER_AGENT, delayMs: 2000 },
    onRedisDown: () => {
      console.error('[daemon] redis unreachable: stopping, retrying in 5 min');
      restartLater();
    },
    onStall: ({ job }: { job: string }) => console.error(`[daemon] ${job} has not succeeded within its staleAfter`),
  });

  daemon.job({
    name: 'peerpush',
    every: '1d',
    staleAfter: '3d',
    timeout: '5m',
    run: async (ctx) => {
      const r = await syncPeerpushDeals(getDb(), {
        fetchText: async (url) => (await ctx.fetch.text(url, { accept: 'text/html', signal: ctx.signal })).text,
        // The daemon schedules itself; this only stops a restart on the local engine re-reading at once.
        minMinutesBetweenRuns: 20 * 60,
      });
      if (!r.skipped) {
        console.log(`[peerpush] ${r.deals} deals, ${r.inserted} new, ${r.updated} updated, ${r.pruned} expired removed`);
      }
      const { added, ...counts } = r;
      return { ...counts, added: added.slice(0, 20) };
    },
  });
  return daemon;
}

function restartLater(): void {
  const h = holder();
  const old = h.daemon;
  h.daemon = undefined;
  old?.stop().catch(() => {});
  if (h.retry) return;
  h.retry = setTimeout(() => {
    h.retry = undefined;
    startDaemon();
  }, RETRY_MS);
  h.retry.unref?.();
}

/** Start once per process. `SCRAPER_DAEMON=0` turns it off. */
export function startDaemon(): void {
  if (process.env.SCRAPER_DAEMON === '0') return;
  const h = holder();
  if (h.daemon) return;
  try {
    h.daemon = build();
    Promise.resolve(h.daemon.start()).catch((err: unknown) => {
      console.error('[daemon] start failed:', err instanceof Error ? err.message : err);
      restartLater();
    });
  } catch (err) {
    console.error('[daemon] start failed:', err instanceof Error ? err.message : err);
  }
}

export function getDaemon(): Daemon | undefined {
  return holder().daemon;
}
