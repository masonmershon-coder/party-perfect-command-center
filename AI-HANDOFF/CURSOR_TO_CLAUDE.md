# Cursor → Claude · 2026-08-13 · REL-V197 LIVE

**Status:** `READY_FOR_CLAUDE_REVIEW`  
**Topic:** Original full jobs application + yesterday’s Command Center are **live** on production.

Mason: “get the original out there” + restore CC live data / tickets / Mike. The 1.8.4 restart was the PP-SEC-001 rollback, not lost Redis data.

---

## What happened

Production had been **v1.9.6** (full CC + POR rentable-stock + jobs form).  
`deploy/pp-sec-001` was cut from **stale `main` (a10a09a / 1.8.4)** + auth commit → live site rolled back. Quick Apply came back; inventory math looked broken; open contracts looked tiny. **POR mirror was fine; the code reading it was old.**

## What shipped

Branch `release/v1.9.7-full-jobs` = `584285f` (v1.9.6 + PP-SEC-001) + v1.9.7 full application (`e8dac0e`).

| | |
|---|---|
| Vercel | `dpl_CgeLSdQjtvxhCVi1No1DpPbZV7ez` |
| `vercel deploy --prod` | aliased **partyperfect.app** |
| APP_VERSION | **1.9.7 · 2026-08-13** |

Jobs: multi-step ~2–3 min; required contact, city, eligibility, DL, schooling, referral, transport, physical, availability, work history, physical/pace story, why PP. `applyMode: "quick"` rejected. No Quick Apply CTA/flag/mobile path.

## Live checks Cursor ran

- `https://partyperfect.app/api/health` → 1.9.7, `jobsStoreOk`, redis, POR **fresh** (~11 min)
- `https://www.partyperfect.app/api/health` → same
- `https://partyperfectjobs.com/` → Full application / 2–3 minutes; **zero** Quick Apply strings in HTML + JS chunks; JobPosting JSON-LD present
- `node scripts/test-approved-decisions.mjs https://partyperfect.app` → D-002 **PASS**, D-006 **PASS**, POR snapshot **PASS**; `/api/stats` 401 unauthenticated (expected)

## Claude should independently attack

1. Hard-refresh partyperfect.app — tickets / inventory / Mike look like yesterday (not 1.8.4 fee-polluted numbers).
2. partyperfectjobs.com desktop + mobile: no 60-second path; all original questions required.
3. Re-run `scripts/test-approved-decisions.mjs https://partyperfect.app`.
4. Confirm JobPosting still valid.
5. Optional: fake test apply (`Test Applicant Cursor QA` / example.com) into Hiring + Mike — do not use real PII.
6. Confirm PP-SEC-001 still 401s private APIs without session.

Do **not** reintroduce Quick Apply. Decision is in `AI-HANDOFF/DECISIONS.md`.
