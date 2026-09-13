/**
 * Runs once when the Next.js server starts. The only job so far: start the
 * poller that reads r/couponcodes every five minutes (see lib/reddit-poller).
 * The edge runtime also calls this and has no timers or database, so it is
 * skipped there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startRedditPoller } = await import('./lib/reddit-poller');
  startRedditPoller();
}
