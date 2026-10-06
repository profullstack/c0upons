import 'server-only';
import { getDb } from './db';

/**
 * What c0upons knows about a signed-in member beyond their DID: the name
 * CoinPay gave at sign-in. Sessions carry only the DID, so this is where the
 * forum bridge (app/api/v1/bridge) finds a name to hand over.
 *
 * The table creates itself, because migrations are not run on deploy.
 */
let ready: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  ready ??= getDb()
    .sql`
      CREATE TABLE IF NOT EXISTS members (
        did        TEXT PRIMARY KEY,
        name       TEXT,
        email      TEXT,
        updated_at TEXT NOT NULL
      )
    `.then(
      () => undefined,
      (error) => {
        ready = null;
        throw error;
      },
    );
  return ready;
}

export interface Member {
  did: string;
  name: string | null;
  email: string | null;
}

export async function rememberMember(did: string, profile: { name?: unknown; email?: unknown }): Promise<void> {
  await ensureTable();
  const name = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim().slice(0, 120) : null;
  const email = typeof profile.email === 'string' && profile.email.includes('@') ? profile.email.trim().slice(0, 320) : null;
  await getDb().sql`
    INSERT INTO members (did, name, email, updated_at)
    VALUES (${did}, ${name}, ${email}, ${new Date().toISOString()})
    ON CONFLICT (did) DO UPDATE SET
      name = COALESCE(excluded.name, members.name),
      email = COALESCE(excluded.email, members.email),
      updated_at = excluded.updated_at
  `;
}

export async function memberByDid(did: string): Promise<Member | null> {
  await ensureTable();
  const rows = await getDb().sql`SELECT did, name, email FROM members WHERE did = ${did}`;
  const row = rows[0];
  return row ? { did: String(row.did), name: row.name ?? null, email: row.email ?? null } : null;
}
