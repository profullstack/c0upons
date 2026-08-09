import 'server-only';
import { NextResponse } from 'next/server';
import { isDbPaused } from './db';

/**
 * What a caller sees when the database node is parked. It names the cause
 * rather than the fix: the dashboard restart is an operator action, and the
 * person hitting the API can only wait.
 */
export const DB_PAUSED_MESSAGE =
  'The coupon database is temporarily unavailable and should be back shortly.';

/**
 * Map an error caught in a route handler onto a response.
 *
 * A paused database is a transient infrastructure state, not a bad request and
 * not a bug, so it answers 503 + Retry-After instead of a blanket 500. Anything
 * else keeps the route's own 500 and message, so a genuine defect still reads
 * as a defect. `code` is stable for clients to branch on — the CLI prints its
 * own wording for `database_paused` rather than echoing a raw HTTP status.
 */
export function dbErrorResponse(err: unknown, fallback: string): NextResponse {
  if (isDbPaused(err)) {
    return NextResponse.json(
      { error: DB_PAUSED_MESSAGE, code: 'database_paused' },
      { status: 503, headers: { 'Retry-After': '60' } }
    );
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
