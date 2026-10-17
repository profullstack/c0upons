// Store logos scraped from Reddit/nichedb/Flipp often fall back to Google's s2
// favicon service. For domains Google has no icon for it answers 404 (with a
// generic globe PNG as the body), and next/image passes that 404 straight
// through, so /_next/image?url=...s2/favicons... showed up as broken links.
// Those URLs are routed through /api/favicon instead, which always answers 200
// with an image (Google's icon, its globe, or a letter tile).

const GOOGLE_FAVICON = /^https:\/\/www\.google\.com\/s2\/favicons\?/i;

export function logoSrc(url: string): { src: string; unoptimized: boolean } {
  if (!GOOGLE_FAVICON.test(url)) return { src: url, unoptimized: false };
  const params = new URL(url).searchParams;
  const domain = params.get('domain') ?? '';
  const sz = params.get('sz') ?? '128';
  return {
    src: `/api/favicon?domain=${encodeURIComponent(domain)}&sz=${encodeURIComponent(sz)}`,
    // A 16-128px icon gains nothing from the optimizer, and a local src with a
    // query string would need images.localPatterns.
    unoptimized: true,
  };
}
