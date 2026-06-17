import { randomBytes } from 'node:crypto';

// URL-safe, non-sequential public identifiers for resources whose integer
// primary keys should not be exposed in URLs (enumeration / count leakage).
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generate a short, URL-safe, non-sequential id (base62, ~71 bits at len 12).
 * Collision probability is negligible at our scale; callers should still rely
 * on a UNIQUE constraint as the source of truth.
 */
export function generatePublicId(length = 12): string {
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return id;
}
