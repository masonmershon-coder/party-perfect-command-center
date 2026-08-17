# KITUWA live private owner alpha — 2026-08-17

**Status:** `READY_FOR_MASON_LIVE_ALPHA` (Mason must retrieve owner PIN from Vercel UI)  
**Live URL:** https://kituwa.app  
**Vercel project:** `kituwa` (`prj_oaL4ROlPrqrw8qqEBU78EXREMkEF`)  
**Deployment ID:** `dpl_98qkwVxpB4kBHoNHxx5CiUkM21SM`  
**Deployed SHA:** `a01293f78a567c860883d435852fc5e86fc351f3`  
**Parent approved SHA:** `c826d8b41c8d1a21d38dc9c067397226066d051e`  
**Rollback target (prior failed build):** `dpl_AvHeF6eq5Ei1xgC9rnmq4ELWc7Zw` (build failed — do not use)

No secrets, PINs, or tokens in this file.

## Deploy delta from approved candidate

| Commit | Purpose |
|--------|---------|
| `d822a1b` | Kituwa-only Vercel surface (`KITUWA_SURFACE=1`), fail-closed durable storage on Vercel, remove PP crons from `vercel.json`, `www`→apex redirect, PWA start URL `/` |
| `a01293f` | Lazy-init Grok client so Kituwa builds without `XAI_API_KEY` |

## Architecture

| Layer | Implementation |
|-------|----------------|
| Host isolation | `middleware.ts` + `KITUWA_SURFACE=1` on `kituwa` project |
| Auth | Cookie `kituwa_session` · env `KITUWA_OWNER_PIN` + `KITUWA_SESSION_SECRET` |
| Durable state | Vercel Blob store `kituwa-alpha` → `kituwa/state.json` via `lib/durable-json` |
| Matter routing | `lib/kituwa/matter-bridge.ts` → `matter-registry.mjs` `route()` (read-only policy copy) |
| Workers | No fake RUNNING; stale heartbeat → `BLOCKED` / `ASSIGNED` only |

## Env (names only — Production on `kituwa`)

| Name | Status |
|------|--------|
| `KITUWA_SESSION_SECRET` | PRESENT |
| `KITUWA_OWNER_PIN` | PRESENT (auto-generated at deploy — **Mason retrieve in Vercel UI**, not chat) |
| `KITUWA_SURFACE` | PRESENT (`1`) |
| `BLOB_READ_WRITE_TOKEN` | PRESENT (dedicated Blob store `kituwa-alpha`) |

## Live probes (2026-08-17)

| Check | Result |
|-------|--------|
| https://kituwa.app | 200 · serves KITUWA (not PP Time / CC) |
| https://www.kituwa.app | 200 → `https://kituwa.app/` |
| `/time` on kituwa host | Rewrites to Kituwa (not employee Time UI) |
| `/api/por/*`, `/api/time/*`, `/api/auth/session` on kituwa host | **404** |
| `/api/kituwa/state` unauthenticated | **401** |
| Wrong PIN login | **401** |
| https://partyperfect.app | **200** unchanged |
| PWA manifest | `name=KITUWA`, `start_url=/`, `display=standalone` |

## Mason first-use steps

1. Vercel → **party-perfect** → **kituwa** → Settings → Environment Variables → **`KITUWA_OWNER_PIN`** → View (or replace with a PIN you choose, then **Redeploy**).
2. iPhone Safari → https://kituwa.app → Enter PIN → **Add to Home Screen**.
3. Talk to Matter with Integrity Customs brief — expect **`BLOCKED`/`WAITING`** on external worker tasks until a worker with fresh heartbeat is online (truthful; do not bypass).

## Known limitations

- **REAL WORKER EXECUTION:** Not proven live; Matter registry heartbeats likely stale → tasks `BLOCKED`/`ASSIGNED`, not `RUNNING`.
- **VOICE_IPHONE:** Not tested on physical device this cycle; Web Speech fallback message exists in UI.
- **Codex live auth test:** Use wrong-PIN → 401; correct PIN only from Vercel UI.

## Safety holds (unchanged)

`PAID_AUTONOMY=OFF` · `LIVE_V2=OFF` · `POR_WRITE=BLOCKED` · `WATCHDOG=UNARMED` · PP Time `0009=HELD`
