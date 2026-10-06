# c0upons.com/bbs

The forums at https://c0upons.com/bbs are a [tsbb](https://github.com/profullstack/tsbb)
board, not part of this app. nginx sends `/bbs` and `/bbs/*` to it before the Next.js
app ever sees the request (cli-tools `dev2/sites.d/c0upons.com.json`, `nginx_locations`).

| | |
| --- | --- |
| Box | dev2, `/home/anthony/www/c0upons.com-bbs`, container `c0uponscom-bbs-app-1`, `127.0.0.1:3293` |
| Base URL | `TSBB_BASE_URL=https://c0upons.com/bbs` (tsbb >= 0.9.0 mounts itself under the path) |
| Data | SQLite on the volume: `volumes/data/tsbb.db` |
| Secrets | logicsrc vault `c0upons-bbs--prod` |
| Updates | follows tsbb GitHub releases on its own (`TSBB_CHECKOUT_DIR`), every 5 minutes |
| Admin | `anthony` (anthony@profullstack.com), sign in at /bbs/login |

`seed-forums.ts` creates the Slickdeals-style forum tree and the c0upons branding
(tsbb's `deals` skin, tsbb >= 0.11.0: the store-page look, this site's header nav via `board.navLinks`, light only).
It is idempotent: forums are matched by slug, so re-running only adds what is missing.

```sh
docker cp ops/bbs/seed-forums.ts c0uponscom-bbs-app-1:/app/data/seed-forums.ts
docker exec c0uponscom-bbs-app-1 node /app/data/seed-forums.ts
docker restart c0uponscom-bbs-app-1   # settings are cached per process
```

## Email-intake coupons are posted here

Every coupon that mail to submit@c0upons.com creates also gets a thread on the board
(`apps/web/lib/bbs-post.ts`, called from the email webhook after it answers):

- **Forum:** read from the offer's words, since coupons carry no category:
  - Freebies (a free item, never "free shipping")
  - Grocery & Weekly Ads, Tech Deals, Home & Garden, Clothing & Beauty, Travel Deals
  - otherwise Coupons & Promo Codes for a code, Hot Deals for a sale
- **Body:** store, code, deal and expiry, linking to the coupon's page.
- **Once only:** `bbs_posts` records each coupon, so a retried mail never posts twice.
- **Pacing:** posts are 16 s apart, because tsbb's flood guard refuses a second post inside 15 s. A `flooding` refusal waits and tries once more.
- **Account:** posts go out as board user `c0upons` (#4), with the `tsbb_` token in vault `c0upons--prod` as `BBS_POST_TOKEN`. Without it nothing is posted. `BBS_API_URL` overrides the board (default `https://c0upons.com/bbs`).

To mint a new token (it reuses the user, and the old token keeps working until it is revoked in the board's settings):

```sh
docker cp ops/bbs/mint-poster.ts c0uponscom-bbs-app-1:/app/data/mint-poster.ts
docker exec -e TSBB_CHECKOUT_DIR=/app/data/app c0uponscom-bbs-app-1 node /app/data/mint-poster.ts
```
