# RELEASE STATE

**Updated:** 2026-08-13 · **Owner:** Cursor · Read this before ANY production deploy.

## Approved state (shipping now)

| | |
|---|---|
| Approved branch | `release/v1.9.7-full-jobs` |
| Base | `584285f` (v1.9.6 Command Center + PP-SEC-001) |
| Approved APP_VERSION | **1.9.7** |
| Contains D-001 full jobs application | YES (validator + multi-step form; Quick Apply rejected) |
| Contains PP-SEC-001 (`ddfadc1`) | YES (via `584285f`) |
| Contains POR STAT / rentable-stock fixes | YES (via v1.9.6 lineage) |
| Deployed to production | **IN PROGRESS** — Mason 2026-08-13: get the original application + yesterday’s CC live |

## Current production (WRONG until this cutover)

| | |
|---|---|
| Live APP_VERSION | **1.8.4 · 2026-08-10** |
| Lineage | `main` @ `a10a09a` + `ddfadc1` |
| Missing | v1.9.0–v1.9.7 — including full application + POR rentable-stock math |
| POR mirror | typically fresh — **the mirror is fine; the code reading it is old** |

## Never again

`deploy/pp-sec-001` was branched from `main` (Aug 10) rather than from the latest approved state. One good security commit on a stale base reverted six releases. **Branch hotfixes from the approved commit, not from `main`.**
