import 'server-only';
import type { Client, InValue } from '@libsql/client';
import { createClient as createPostgresClient } from '@profullstack/libsql-pg';
import { createRequire } from 'node:module';
import { loadRootEnv } from './root-env';

let client: Client | null = null;
const POSTGRES_URL = /^postgres(ql)?:\/\//i;
const require_ = createRequire(import.meta.url);

/**
 * The database URL: `DATABASE_URL=postgres://...` in production (the shared
 * Postgres cluster on dev2, reached through @profullstack/libsql-pg, which keeps
 * the @libsql/client surface and rewrites the SQLite idioms per statement), or a
 * `file:` path for local runs and the tests. `TURSO_DATABASE_URL` is still read
 * as a fallback name for a `file:` URL; a `libsql://` value is refused, because
 * the data left Turso for Postgres in 2026-09.
 */
export function databaseUrl(): string {
  loadRootEnv();
  const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (postgres://... in production, file:... locally)');
  if (!POSTGRES_URL.test(url) && !url.startsWith('file:')) {
    throw new Error(
      `DATABASE_URL must be a postgres:// URL (production) or a file: path (local); got "${url.split(':')[0]}:". ` +
        'Turso/libsql:// is no longer supported: the data lives in Postgres now.',
    );
  }
  return url;
}

function getClient(): Client {
  if (client) return client;
  const url = databaseUrl();
  if (POSTGRES_URL.test(url)) {
    client = createPostgresClient({ url }) as unknown as Client;
  } else {
    // @libsql/client is a devDependency, loaded lazily: the production image
    // needs neither it nor its native binding.
    const { createClient } = require_('@libsql/client') as typeof import('@libsql/client');
    client = createClient({ url });
  }
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
 * On Postgres the handle is a connection pool; a dropped connection is
 * replaced by the pool rather than poisoning the cached handle the way the old
 * SQLite Cloud websocket once silently emptied /blog.
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

// The shapes an unreachable or missing database produces (kept from the Turso
// days; a Postgres connection refused or a pool timeout reads the same way).
// Callers use this to tell "c0upons is down" (transient, 503) apart from
// "c0upons is broken" (a real 500).
export function isDbPaused(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /archived|not found|unavailable|SERVER_ERROR|502|503|ECONNREFUSED|ECONNRESET|timeout exceeded when trying to connect/i.test(msg);
}
