/**
 * The c0upons.com/bbs forum tree and branding: a Slickdeals-style deal board.
 *
 * Runs inside the tsbb container, against the board's own database:
 *
 *   docker cp ops/bbs/seed-forums.ts c0uponscom-bbs-app-1:/app/data/seed-forums.ts
 *   docker exec c0uponscom-bbs-app-1 node /app/data/seed-forums.ts
 *   docker restart c0uponscom-bbs-app-1      # settings are cached per process
 *
 * Idempotent. Forums are matched by slug, so re-running adds what is missing
 * and leaves admin edits (names, order) alone. It runs before tsbb's own seed,
 * which then skips its generic starter tree because forums already exist, and
 * fills in groups, permissions and ranks as usual.
 */
const CHECKOUT = process.env.TSBB_CHECKOUT_DIR ?? '/app';
const { migrate } = await import(`${CHECKOUT}/packages/db/src/migrate.ts`);
const { one, run, now } = await import(`${CHECKOUT}/packages/db/src/client.ts`);
const { seed } = await import(`${CHECKOUT}/packages/db/src/seed.ts`);

type Forum = { slug: string; name: string; description: string };
type Category = { slug: string; name: string; forums: Forum[] };

const TREE: Category[] = [
  {
    slug: 'deals',
    name: 'Deals',
    forums: [
      { slug: 'hot-deals', name: 'Hot Deals', description: 'Found a price worth sharing? Post the store, the price and the link. The best ones get voted up.' },
      { slug: 'coupons', name: 'Coupons & Promo Codes', description: 'Working codes, printable coupons, cashback and stacking tricks. Say where and when it worked.' },
      { slug: 'freebies', name: 'Freebies', description: 'Free samples, free-after-rebate, free trials actually worth having.' },
      { slug: 'grocery', name: 'Grocery & Weekly Ads', description: 'Weekly flyer highlights, digital coupons and grocery stacks.' },
      { slug: 'tech-deals', name: 'Tech Deals', description: 'Laptops, phones, games, gadgets and software.' },
      { slug: 'home-deals', name: 'Home & Garden', description: 'Appliances, tools, furniture and everything for the house.' },
      { slug: 'fashion-deals', name: 'Clothing & Beauty', description: 'Apparel, shoes, accessories and beauty sales.' },
      { slug: 'travel-deals', name: 'Travel Deals', description: 'Flights, hotels, error fares and points tricks.' },
    ],
  },
  {
    slug: 'community',
    name: 'Community',
    forums: [
      { slug: 'deal-requests', name: 'Deal Requests', description: 'Looking for something? Ask, and someone will hunt down the best price.' },
      { slug: 'deal-talk', name: 'Deal Talk', description: 'Price history, store policies, price matching, return wins and losses.' },
      { slug: 'contests', name: 'Contests & Giveaways', description: 'Sweepstakes and giveaways worth entering.' },
      { slug: 'off-topic', name: 'Off Topic', description: 'Anything that is not a deal.' },
    ],
  },
  {
    slug: 'c0upons',
    name: 'c0upons',
    forums: [
      { slug: 'announcements', name: 'Announcements', description: 'News about c0upons.com and these forums.' },
      { slug: 'feedback', name: 'Feedback & Bugs', description: 'Something broken, or an idea for the site? Tell us here.' },
    ],
  },
];

const SETTINGS: Record<string, unknown> = {
  'board.name': 'c0upons forums',
  'board.tagline': 'Hot deals, coupon codes and freebies, shared by the people who found them.',
  'board.description':
    'The c0upons.com community: post hot deals, working promo codes and freebies, ask for a deal, and vote up the best finds.',
  'board.skin': 'deals',
  'board.accent': '#f97316',
  'board.logoUrl': 'https://c0upons.com/logo.svg',
  'board.logoHref': 'https://c0upons.com',
  'board.faviconUrl': 'https://c0upons.com/favicon.svg',
  // The tsbb platform pitch on the index is for boards that are about tsbb.
  'board.showPlatform': false,
};

await migrate(undefined, { quiet: true });

async function upsertForum(parentId: number | null, kind: string, slug: string, name: string, description: string | null, position: number) {
  const existing = await one<{ id: number }>('SELECT id FROM forums WHERE slug = ?', [slug]);
  if (existing) return Number(existing.id);
  const result = await run(
    `INSERT INTO forums (parent_id, kind, slug, name, description, position, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [parentId, kind, slug, name, description, position, now()],
  );
  console.log(`  + ${kind} ${slug}`);
  return Number((result.rows[0] as unknown as { id: number }).id);
}

for (const [c, category] of TREE.entries()) {
  const parent = await upsertForum(null, 'category', category.slug, category.name, null, c);
  for (const [f, forum] of category.forums.entries()) {
    await upsertForum(parent, 'forum', forum.slug, forum.name, forum.description, f);
  }
}

for (const [key, value] of Object.entries(SETTINGS)) {
  await run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), now()],
  );
}
console.log('  settings');

await seed({ quiet: true });
console.log('Done. Restart the container so the running board reloads its settings.');
process.exit(0);
