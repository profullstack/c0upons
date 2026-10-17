import { describe, expect, it } from 'bun:test';
import { closestSlug } from '../apps/web/lib/blog-slugs.ts';

const SLUGS = [
  'amazon-promo-code-workflow',
  'cvs-photo-promo-code-workflow',
  'walgreens-photo-coupon-code-workflow-2026',
  'walgreens-photo-coupon-code-workflow-2026-guide',
  'papa-johns-promo-codes-2026-checkout-workflow',
];
describe('closestSlug', () => {
  it('maps an old slug to the post of the same store', () => {
    expect(closestSlug('walgreens-coupon-code-workflow', SLUGS)).toBe('walgreens-photo-coupon-code-workflow-2026');
  });
  it('keeps an existing slug and returns null when no post is close', () => {
    expect(closestSlug('cvs-photo-promo-code-workflow', SLUGS)).toBe('cvs-photo-promo-code-workflow');
    expect(closestSlug('doordash-promo-codes-for-existing-users-2026-workflow', SLUGS)).toBeNull();
    expect(closestSlug('encrypted-messaging-coupon-codes-private-deal-sharing', SLUGS)).toBeNull();
  });
});
