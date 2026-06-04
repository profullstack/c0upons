# c0upons Skill

A community coupon code directory. Use it to find discount codes and deals for online stores.

**API base:** https://c0upons.com/api  
**Auth:** None required for read operations  
**Docs:** https://c0upons.com/docs

## Tools

- **search** — Search coupons by store name, code, or title  
  `GET /api/search?q={query}` → `[{ id, title, code, discount, store_name, store_slug, votes }]`

- **list_coupons** — Get trending coupons ordered by votes  
  `GET /api/coupons` → array of coupon objects

- **get_coupon** — Get a single coupon by ID  
  `GET /api/coupons/{id}` → coupon object

- **list_stores** — List all stores with active coupons  
  `GET /api/stores` → `[{ id, name, slug, coupon_count }]`

- **get_store** — Get a store and its coupons  
  `GET /api/stores/{slug}` → `{ store, coupons[] }`

- **submit_coupon** — Submit a new coupon  
  `POST /api/coupons` body: `{ store_id, title, code?, discount?, expiry_date?, url? }`

## Example queries

- "Find a Nike coupon code" → `GET /api/search?q=nike`
- "What Amazon coupons are available?" → `GET /api/stores/amazon`
- "Show me the best deals right now" → `GET /api/coupons`
