import 'server-only';

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let loaded = false;

export function loadRootEnv() {
  if (loaded) return;
  loaded = true;

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../..', '.env'),
  ];
  const envPath = candidates.find((path) => existsSync(path));
  if (!envPath) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    process.env[key] ??= value;
  }
}
