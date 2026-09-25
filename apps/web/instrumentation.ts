/**
 * Runs once when the Next.js server starts: starts the pollers that read
 * r/couponcodes every five minutes (lib/reddit-poller) and the grocery
 * weekly ads every five (lib/flipp-poller). The edge runtime also calls this
 * and has no timers or database, so it is skipped there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startRedditPoller } = await import('./lib/reddit-poller');
  startRedditPoller();
  const { startFlippPoller } = await import('./lib/flipp-poller');
  startFlippPoller();
}
