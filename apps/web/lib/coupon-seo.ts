// Per-coupon titles, descriptions and structured data.
//
// Kept free of `server-only` and of any database import so the whole lot stays
// pure and testable: everything here is a function of one already-loaded row.
import type { Coupon } from './types';

export const BASE = 'https://c0upons.com';

/** Trim to `max` characters on a word boundary, with an ellipsis. */
export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  // Only honour the word boundary when it is not so early that the snippet
  // loses its point; otherwise a single long word would chop the title away.
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${kept.replace(/[\s,.;:—–-]+$/, '')}…`;
}

/**
 * Flatten the light markup that rides along on scraped deal text.
 *
 * Feeds like Slickdeals hand us "Macy's [macys.com] has *Comforter Sets* on
 * sale from *$24.99*", and asterisks and bare bracketed domains read as noise
 * in a search snippet, which is the one place this text has to stand alone.
 */
export function plainText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1') // [label](url) -> label
    .replace(/\[([\w.-]+\.[a-z]{2,})\]/gi, '') // a bare [macys.com] -> nothing
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // **bold** / __bold__
    .replace(/(?<![\w*])\*(?!\s)([^*]+?)(?<!\s)\*(?![\w*])/g, '$1') // *emphasis*
    .replace(/\s+([,.;:!?])/g, '$1') // tidy the gaps the removals leave
    .replace(/\s+/g, ' ')
    .trim();
}

function storeName(coupon: Coupon): string | null {
  const name = coupon.store_name?.trim();
  return name ? name : null;
}

/**
 * The <title>, minus the " — c0upons" the root layout template appends.
 *
 * Scraped deal titles routinely lead with the merchant ("Macy's Christmas
 * Comforter Sale…"), so the store is only prefixed when it is not already in
 * the title — otherwise every Macy's page reads "Macy's: Macy's …".
 */
export function couponTitle(coupon: Coupon): string {
  const store = storeName(coupon);
  const title = plainText(coupon.title);
  const redundant = store && title.toLowerCase().includes(store.toLowerCase());
  return truncate(store && !redundant ? `${store}: ${title}` : title, 62);
}

/** The meta description: discount, the deal itself, the code, the expiry. */
export function couponDescription(coupon: Coupon): string {
  const store = storeName(coupon);
  const parts: string[] = [];

  if (coupon.discount) parts.push(store ? `${coupon.discount} off at ${store}.` : `${coupon.discount} off.`);
  parts.push(plainText(coupon.description || coupon.title).replace(/\s*\.?\s*$/, '.'));
  // The code is already rendered in the page body, so putting it in the
  // snippet gives nothing away and is the strongest reason to click.
  if (coupon.code) parts.push(`Use code ${coupon.code}.`);
  if (coupon.expiry_date) parts.push(`Expires ${coupon.expiry_date}.`);

  const joined = parts.join(' ');
  if (joined.length < 90) {
    parts.push(store ? `More ${store} coupon codes on c0upons.` : 'More coupon codes on c0upons.');
  }
  return truncate(parts.join(' '), 158);
}

/**
 * The share card. Always the generated one: it is the only image guaranteed to
 * be 1200x630, and a store logo is a 56px square that crops to nothing in a
 * timeline.
 */
export function couponShareImage(coupon: Coupon): string {
  return `${BASE}/coupons/${coupon.id}/opengraph-image`;
}

/** The image for structured data, where a real product shot beats the card. */
export function couponImage(coupon: Coupon): string {
  return coupon.image_url || coupon.store_logo || couponShareImage(coupon);
}

/** schema.org dates must be ISO 8601; the column is free text, so check first. */
function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value.trim());
  return match ? match[0] : null;
}

/**
 * An `Offer` for the coupon plus the `BreadcrumbList` for the trail that led
 * to it. Google retired the coupon rich result, but the breadcrumb is still
 * one, and a clean Offer is what every other reader of this page — the agents
 * this site is built for included — expects to find.
 */
export function couponJsonLd(coupon: Coupon): object[] {
  const url = `${BASE}/coupons/${coupon.id}`;
  const store = storeName(coupon);
  const validThrough = isoDate(coupon.expiry_date);
  const posted = isoDate(coupon.created_at);

  const offer: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Offer',
    '@id': url,
    url,
    name: plainText(coupon.title),
    description: coupon.description ? plainText(coupon.description) : couponDescription(coupon),
    category: 'Coupon',
    availability: 'https://schema.org/InStock',
    image: couponImage(coupon),
  };
  if (coupon.code) offer.discountCode = coupon.code;
  if (coupon.discount) offer.discount = coupon.discount;
  if (validThrough) offer.validThrough = validThrough;
  if (posted) offer.availabilityStarts = posted;
  if (store) {
    offer.seller = {
      '@type': 'Organization',
      name: store,
      ...(coupon.store_website ? { url: coupon.store_website } : {}),
      ...(coupon.store_logo ? { logo: coupon.store_logo } : {}),
    };
  }

  const crumbs = [
    { name: 'Home', item: BASE },
    { name: 'Stores', item: `${BASE}/stores` },
    ...(store && coupon.store_slug ? [{ name: store, item: `${BASE}/stores/${coupon.store_slug}` }] : []),
    { name: truncate(plainText(coupon.title), 70), item: url },
  ];

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };

  return [offer, breadcrumbs];
}
