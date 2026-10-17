/** Levenshtein distance, stopping early once it exceeds `max`. */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Store-name token: the first dash-separated word ("doordash-promo-..." -> "doordash"). */
const lead = (s: string) => s.split('-')[0];

/**
 * The published slug an old or mistyped one meant: the closest by edit distance
 * after the post for the same store (shared leading name: walgreens-...), then
 * a near-identical typo within a fifth of its length. Null when nothing plausible exists.
 */
export function closestSlug(slug: string, slugs: Iterable<string>): string | null {
  const all = [...slugs];
  if (all.includes(slug)) return slug;
  const sameStore = all.filter((s) => lead(s) === lead(slug) && lead(slug).length >= 4);
  if (sameStore.length) return sameStore.sort((a, b) => editDistance(slug, a) - editDistance(slug, b))[0];
  const max = Math.max(3, Math.floor(slug.length / 5));
  let best: string | null = null;
  let bestD = max + 1;
  for (const s of all) {
    const d = editDistance(slug, s, bestD - 1);
    if (d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}
