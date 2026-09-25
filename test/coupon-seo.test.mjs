// The per-coupon <title>, meta description and JSON-LD. Every coupon page used
// to inherit the homepage's title, description and — the costly one — its
// canonical, so these assert the page now describes itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { couponTitle, couponDescription, couponJsonLd, couponShareImage, plainText, truncate } = await import(
  '../apps/web/lib/coupon-seo.ts'
);

/** A coupon row as the store-joined query returns it. */
function coupon(overrides = {}) {
  return {
    id: 80013,
    store_id: 42,
    code: 'SAVE20',
    title: '20% off sitewide',
    description: 'Twenty percent off everything, no minimum spend.',
    discount: '20%',
    discount_type: 'percent',
    discount_value: 20,
    expiry_date: '2026-12-23',
    verified: 1,
    votes: 4,
    url: 'https://example.com/deal',
    image_url: null,
    created_at: '2026-09-13 10:37:50',
    store_name: 'Macy’s',
    store_slug: 'macys',
    store_logo: 'https://cdn.example.com/macys.png',
    store_website: 'https://macys.com',
    ...overrides,
  };
}

test('truncate cuts on a word boundary and keeps under the cap', () => {
  const out = truncate('one two three four five six seven eight nine ten', 20);
  assert.ok(out.length <= 20, `${out.length} > 20`);
  assert.ok(out.endsWith('…'));
  assert.ok(!out.includes(' …'), 'no dangling space before the ellipsis');
});

test('truncate leaves a short string untouched and collapses whitespace', () => {
  assert.equal(truncate('  20%   off  ', 40), '20% off');
});

test('truncate still cuts a single unbroken word', () => {
  const out = truncate('a'.repeat(50), 20);
  assert.equal(out.length, 20);
});

// The exact description coupon 80013 carries in production, via the
// Slickdeals-shaped feed: bare bracketed domain, asterisk emphasis.
const SCRAPED =
  "Macy's [macys.com] has *Christmas Comforter Sets* on sale from *$24.99*. Select free store pickup where available.";

test('plainText strips the markup scraped deal text arrives with', () => {
  assert.equal(
    plainText(SCRAPED),
    "Macy's has Christmas Comforter Sets on sale from $24.99. Select free store pickup where available."
  );
});

test('plainText keeps a markdown link label and drops the url', () => {
  assert.equal(plainText('See [the deal](https://example.com/x) now'), 'See the deal now');
});

test('plainText leaves ordinary text, bracketed asides and lone asterisks alone', () => {
  assert.equal(plainText('Save 20% on 3 * 4 packs [limited]'), 'Save 20% on 3 * 4 packs [limited]');
});

test('the meta description carries no leftover markup', () => {
  const description = couponDescription(coupon({ description: SCRAPED }));
  assert.ok(!description.includes('*'), description);
  assert.ok(!description.includes('[macys.com]'), description);
  assert.ok(description.includes('Christmas Comforter Sets'), description);
});

test('JSON-LD name and description are plain text too', () => {
  const [offer] = couponJsonLd(coupon({ description: SCRAPED, title: '*Deal* of the [day]' }));
  assert.ok(!offer.description.includes('*'), offer.description);
  assert.equal(offer.name, 'Deal of the [day]');
});

test('title names the store and the deal', () => {
  const title = couponTitle(coupon());
  assert.ok(title.includes('Macy'), title);
  assert.ok(title.includes('20% off sitewide'), title);
  assert.ok(title.length <= 62, `${title.length} > 62`);
});

test('title does not repeat a store the scraped title already names', () => {
  const title = couponTitle(coupon({ title: "Macy’s Christmas Comforter Sale" }));
  assert.equal(title, "Macy’s Christmas Comforter Sale");
  assert.ok(!title.includes('Macy’s: Macy'), title);
});

test('title survives a store with no name', () => {
  assert.equal(couponTitle(coupon({ store_name: undefined })), '20% off sitewide');
});

test('description carries discount, code and expiry inside the snippet cap', () => {
  const description = couponDescription(coupon());
  assert.ok(description.includes('20% off at Macy'), description);
  assert.ok(description.includes('Use code SAVE20.'), description);
  assert.ok(description.includes('Expires 2026-12-23.'), description);
  assert.ok(description.length <= 158, `${description.length} > 158`);
});

test('description omits the code when there is none on file', () => {
  const description = couponDescription(coupon({ code: null }));
  assert.ok(!description.includes('Use code'), description);
});

test('a thin coupon still gets a usable-length description', () => {
  const description = couponDescription(
    coupon({ code: null, discount: null, description: null, expiry_date: null, title: 'Free shipping' })
  );
  assert.ok(description.length >= 40, description);
  assert.ok(description.includes('Free shipping'), description);
});

test('JSON-LD is an Offer plus a BreadcrumbList', () => {
  const [offer, breadcrumbs] = couponJsonLd(coupon());

  assert.equal(offer['@type'], 'Offer');
  assert.equal(offer.url, 'https://c0upons.com/coupons/80013');
  assert.equal(offer.discountCode, 'SAVE20');
  assert.equal(offer.discount, '20%');
  assert.equal(offer.validThrough, '2026-12-23');
  assert.equal(offer.availabilityStarts, '2026-09-13');
  assert.equal(offer.seller['@type'], 'Organization');
  assert.equal(offer.seller.url, 'https://macys.com');

  assert.equal(breadcrumbs['@type'], 'BreadcrumbList');
  assert.deepEqual(
    breadcrumbs.itemListElement.map((i) => i.position),
    [1, 2, 3, 4]
  );
  assert.equal(breadcrumbs.itemListElement[2].item, 'https://c0upons.com/stores/macys');
  assert.equal(breadcrumbs.itemListElement[3].item, 'https://c0upons.com/coupons/80013');
});

test('JSON-LD drops a non-ISO expiry rather than emitting an invalid date', () => {
  const [offer] = couponJsonLd(coupon({ expiry_date: 'while supplies last' }));
  assert.equal(offer.validThrough, undefined);
});

test('JSON-LD omits the store crumb and seller when the store is unknown', () => {
  const [offer, breadcrumbs] = couponJsonLd(coupon({ store_name: undefined, store_slug: undefined }));
  assert.equal(offer.seller, undefined);
  assert.equal(breadcrumbs.itemListElement.length, 3);
});

test('JSON-LD serializes (no undefined leaks into the script tag)', () => {
  const json = JSON.stringify(couponJsonLd(coupon({ expiry_date: null, code: null })));
  assert.ok(!json.includes('undefined'), json);
});

test('the share card is the generated 1200x630 route, not the store logo', () => {
  assert.equal(couponShareImage(coupon()), 'https://c0upons.com/coupons/80013/opengraph-image');
});
