/**
 * The account the site posts email-intake coupons as, and its API token.
 *
 * Runs inside the tsbb container, against the board's own database:
 *
 *   docker cp ops/bbs/mint-poster.ts c0uponscom-bbs-app-1:/app/data/mint-poster.ts
 *   docker exec -e TSBB_CHECKOUT_DIR=/app/data/app c0uponscom-bbs-app-1 node /app/data/mint-poster.ts
 *
 * Prints a `tsbb_` token once; it goes into the c0upons vault as BBS_POST_TOKEN
 * (the board keeps only its hash). Idempotent for the account: re-running
 * reuses the user and mints a fresh token, which is how a lost one is replaced.
 * TSBB_CHECKOUT_DIR points at the self-updated checkout (/app/data/app) when
 * the board has updated past its image.
 */
const CHECKOUT = process.env.TSBB_CHECKOUT_DIR ?? '/app';
const USERNAME = process.env.POSTER_USERNAME ?? 'c0upons';
const EMAIL = process.env.POSTER_EMAIL ?? 'deals@c0upons.com';

const { migrate } = await import(`${CHECKOUT}/packages/db/src/migrate.ts`);
const { one } = await import(`${CHECKOUT}/packages/db/src/client.ts`);
const { createUser } = await import(`${CHECKOUT}/packages/core/src/users.ts`);
const { mintToken } = await import(`${CHECKOUT}/packages/core/src/auth.ts`);

await migrate(undefined, { quiet: true });

const existing = (await one('SELECT id FROM users WHERE username_lower = ?', [USERNAME.toLowerCase()])) as
  | { id: number }
  | undefined;
const userId = existing?.id ?? (await createUser({ username: USERNAME, email: EMAIL })).id;
const token = await mintToken({ userId, label: 'c0upons.com email intake' });

console.error(`${existing ? 'reused' : 'created'} user ${USERNAME} (#${userId}); token below is shown once`);
console.log(token);
