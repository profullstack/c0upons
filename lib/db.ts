import 'server-only';
import { Database } from '@sqlitecloud/drivers';

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    const url = process.env.SQLITECLOUD_URL;
    if (!url) throw new Error('SQLITECLOUD_URL is not set');
    db = new Database(url);
  }
  return db;
}
