import 'server-only';
import { NextResponse } from 'next/server';
import { isDbPaused } from './db';

/**
 * What a caller sees when the database cannot be reached. It names the cause
 * rather than the fix: reviving an archived database is an operator action, and
 * the person hitting the API can only wait.
 */
export const DB_PAUSED_MESSAGE =
  'The coupon database is temporarily unavailable and should be back shortly.';

/**
 * Map an error caught in a route handler onto a response.
 *
 * An unreachable database is a transient infrastructure state, not a bad
 * request and not a bug, so it answers 503 + Retry-After instead of a blanket
 * 500. Anything else keeps the route's own 500 and message, so a genuine defect
 * still reads as a defect. The `database_paused` code is the published wire
 * contract for clients that want to branch on this rather than parse prose; it
 * predates the move to Turso and is kept as-is so existing callers don't break.
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
