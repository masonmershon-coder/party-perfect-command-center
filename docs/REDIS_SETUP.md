# Party Perfect — Upstash Redis (required)

Production Blob is **suspended**. Hiring apps and live POR snapshots need Redis.

## Confirm current status

```bash
curl -sS https://partyperfect.app/api/health | python3 -m json.tool
```

Success looks like:

- `durableStoreMode`: `"redis"`
- `redisConfigured`: `true`
- `jobsStoreOk`: `true`

As of the last check before this release, production still reported `durableStoreMode: "blob"` with Blob suspended.

## Link Redis (interactive — you must click)

1. Open [Upstash on Vercel Marketplace](https://vercel.com/marketplace/upstash) → **Install** (accept terms).
2. Or in a real interactive terminal:

```bash
cd ~/grok-dashboard
npx vercel integration accept-terms upstash
npx vercel integration add upstash/upstash-kv --plan free -m primaryRegion=iad1 -n party-perfect-redis -e production
```

3. Connect the store to project **party-perfect-command-center** → **Production**.
4. Confirm env vars on Production:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
5. Redeploy Production (Deployments → … → Redeploy).
6. Re-check `/api/health` until `durableStoreMode` is `"redis"`.

## After Redis is live

```bash
npx vercel env pull .env.local
npm run store:migrate
npm run jobs:migrate
```

Also set `POR_SYNC_SECRET` (see `docs/POR_SYNC.md`) so the ENTERPRISE agent can push snapshots.
