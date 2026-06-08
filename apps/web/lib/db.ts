import 'server-only';
import { Database } from '@sqlitecloud/drivers';
import { loadRootEnv } from './root-env';

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    loadRootEnv();
    const url = process.env.SQLITECLOUD_URL;
    if (!url) throw new Error('SQLITECLOUD_URL is not set');
    db = new Database({ connectionstring: url, usewebsocket: true });
  }
  return db;
}
