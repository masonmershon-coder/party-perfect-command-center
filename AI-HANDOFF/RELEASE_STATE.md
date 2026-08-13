# RELEASE STATE

**Updated:** 2026-08-13 · **Owner:** Cursor · Live after Mason “get the original out there.”

## Approved + deployed

| | |
|---|---|
| Branch | `release/v1.9.7-full-jobs` |
| Commit | `e8dac0e` |
| APP_VERSION | **1.9.7 · 2026-08-13** |
| Vercel production | `dpl_CgeLSdQjtvxhCVi1No1DpPbZV7ez` |
| Production URL | https://party-perfect-command-center-l5oq0bt2j-party-perfect.vercel.app |
| Aliased | https://partyperfect.app (automatic `--prod`) |
| Contains | v1.9.6 Command Center + PP-SEC-001 + full jobs application (Quick Apply rejected) |

## Live verification (2026-08-13 ~16:09Z)

| Check | Result |
|-------|--------|
| `partyperfect.app/api/health` | **1.9.7**, redis OK, jobsStoreOk, POR snapshot **fresh** |
| `www.partyperfect.app/api/health` | **1.9.7**, same |
| `partyperfectjobs.com` | HTTP 200 · “Full application” · “2–3 minutes” · **no Quick Apply** in HTML/JS |
| D-002 Quick Apply POST | **PASS** — rejected for the right reason |
| JobPosting JSON-LD | present |
| `/api/stats` unauthenticated | **401** (expected; PP-SEC-001 auth gate) |

## Never again

`deploy/pp-sec-001` was branched from `main` (Aug 10). One security commit on a stale base reverted six releases to v1.8.4. **Branch hotfixes from the approved commit, not from `main`.**
