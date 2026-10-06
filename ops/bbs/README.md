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

`seed-forums.ts` creates the Slickdeals-style forum tree and the c0upons branding.
It is idempotent: forums are matched by slug, so re-running only adds what is missing.

```sh
docker cp ops/bbs/seed-forums.ts c0uponscom-bbs-app-1:/app/data/seed-forums.ts
docker exec c0uponscom-bbs-app-1 node /app/data/seed-forums.ts
docker restart c0uponscom-bbs-app-1   # settings are cached per process
```
