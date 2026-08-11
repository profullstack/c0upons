import 'server-only';
import { createClient, type Client, type InValue } from '@libsql/client';
import { loadRootEnv } from './root-env';

let client: Client | null = null;

function getClient(): Client {
  if (client) return client;
  loadRootEnv();
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  // A `file:` URL needs no token, which is what makes local runs and tests
  // possible without production credentials.
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  return client;
}

// libSQL refuses `undefined` outright ("undefined cannot be passed as argument
// to the database"), while the routes hand it over freely for absent optional
// fields — an unscraped image_url, a webhook payload without a thumbnail. The
// old driver swallowed those; coercing here keeps a missing field a NULL
// instead of turning it into a 500.
function bind(value: unknown): InValue {
  return value === undefined ? null : (value as InValue);
}

/**
 * The database handle. Only `db.sql` is used anywhere in the app, so this
 * exposes exactly that: a tagged template that binds every interpolated value
 * as a parameter and resolves to the rows.
 *
 * libSQL rows are array-like *and* object-like, and serialize to plain named
 * objects, so callers keep working unchanged — `rows.length`, destructuring a
 * single COUNT row, and `NextResponse.json(rows)` all behave as before.
 *
 * Unlike the SQLite Cloud driver this replaces, there is no long-lived
 * websocket to go stale, so no reconnect dance is needed: the HTTP client
 * establishes a connection per request and a dropped one cannot poison the
 * cached handle the way it once silently emptied /blog.
 */
export function getDb() {
  return {
    // The app assigns results straight to its own row types
    // (`const stores: StoreWithCount[] = await db.sql...`), which is why this
    // stays `any` rather than forcing a cast at all 77 call sites.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sql: async (strings: TemplateStringsArray, ...values: unknown[]): Promise<any> => {
      const rs = await getClient().execute({
        sql: strings.join('?'),
        args: values.map(bind),
      });
      return rs.rows;
    },
  };
}

// Turso scales an idle free database to zero and wakes it automatically on the
// next request, so a brief stall is normal rather than an outage. A group left
// idle for ten days is archived instead, and that state does need an explicit
// unarchive call — the shapes below are the ones seen for a database that is
// gone or unreachable rather than merely asleep. Callers use this to tell
// "c0upons is down" (transient, 503) apart from "c0upons is broken" (a real
// 500).
export function isDbPaused(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /archived|not found|unavailable|SERVER_ERROR|502|503/i.test(msg);
}
