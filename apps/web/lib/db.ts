import 'server-only';
import { Database } from '@sqlitecloud/drivers';
import { loadRootEnv } from './root-env';

let client: Database | null = null;

function createClient(): Database {
  loadRootEnv();
  const url = process.env.SQLITECLOUD_URL;
  if (!url) throw new Error('SQLITECLOUD_URL is not set');
  return new Database({ connectionstring: url, usewebsocket: true });
}

// A cached client can hold a dead websocket after the SQLite Cloud node pauses
// and resumes (free-tier auto-pause). Without this, getDb() keeps returning the
// same broken connection and every query fails with "Connection unavailable"
// until the process is restarted — which is exactly how /blog silently emptied.
// Treat disconnect-class errors as recoverable: drop the client and retry once
// with a fresh connection.
function isDisconnect(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /connection unavailable|got disconnected|disconnected|connection not been established|ERR_CONNECTION/i.test(
    msg
  );
}

async function runSql(args: unknown[]): Promise<unknown> {
  if (!client) client = createClient();
  try {
    return await (client.sql as (...a: unknown[]) => Promise<unknown>)(...args);
  } catch (err) {
    if (!isDisconnect(err)) throw err;
    try {
      (client as unknown as { close?: () => void }).close?.();
    } catch {
      /* ignore close failures on an already-dead socket */
    }
    client = createClient();
    return await (client.sql as (...a: unknown[]) => Promise<unknown>)(...args);
  }
}

// Returns the shared client with its `sql` tagged-template wrapped so a stale
// connection self-heals. All call sites use only `db.sql`, so this is drop-in.
export function getDb(): Database {
  if (!client) client = createClient();
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'sql') {
        return (...args: unknown[]) => runSql(args);
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
