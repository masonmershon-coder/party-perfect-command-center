# GO LIVE — POR 2.0 / Showroom Quote Desk

No secrets in this file. Paste values only into `.env.local` and Vercel — never into chat handoff markdown if avoidable.

Supabase project: **Party Perfect App** · ref `wkwksjitkyhaqgrxasml` · us-west-2  
Branch: `claude/showroom-quote-desk`  
Sites: https://partyperfect.app · https://partyperfectjobs.com

---

## 1) Mason — unblock (required)

### A. DATABASE_URL
1. Open Supabase → Party Perfect App → **Connect** → **Direct / Connection string**.
2. Choose **Session pooler** (recommended for Node on Vercel).
3. Copy URI into:
   - Local: `.env.local` as `DATABASE_URL=...`
   - Vercel project env (Production + Preview): same name
4. Tell Cursor: **“DATABASE_URL is set”** (do not paste the string into AI-HANDOFF).

### B. Square
Set in `.env.local` + Vercel:
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `SQUARE_ENV` = `production` (or `sandbox` for test)

### C. Confirm already set
- `POR_SYNC_SECRET` (same on ENTERPRISE agent)
- `AUTH_PASSWORD` / `OWNER_PIN`

---

## 2) Cursor — after env is set

```bash
# Apply schema (or run 0001 then 0002 in Supabase SQL Editor as postgres)
node --env-file=.env.local -e "/* or use ingest which auto-applies if missing */"

npm i
node --env-file=.env.local scripts/ingest-por-supabase.mjs
```

Verify (SQL Editor or `psql`):
```sql
select count(*) from por.customers;      -- ~13824
select count(*) from por.contracts;      -- ~160551 (logical)
select count(*) from por.contract_items; -- ~317988
select count(*) from por.payments;       -- ~24840
select count(*) from por.items;          -- ~9876
```

Smoke APIs (logged into Command Center):
- `/api/por/customer-history?q=Oberste`
- `/api/por/customer-history?key=<cnum>` as owner vs employee

---

## 3) Claude — parallel

Finish Showroom Quote Desk UI on the same branch (search → date/lines → availability → price → email + Square → print).  
Reuse: `lib/quote-engine.ts`, `lib/por-availability.ts`, `lib/quote-desk-api.ts`, `/api/payments/square-link`.

---

## 4) Cursor — ship

1. Claude marks UI ready  
2. Merge `claude/showroom-quote-desk` → `main`  
3. Vercel production deploy with env  
4. Copy updated `por-sync-agent` to ENTERPRISE; `SqlServer=ENTERPRISE,9676`; confirm POSTs to `/api/por/sync/postgres` every ~10 min  
5. Smoke partyperfect.app Quote Desk + Mike customer lookup  

Jobs site (partyperfectjobs.com) is separate hiring surface — not blocked by Supabase POR mirror, but ships from same repo when merged.

---

## Guardrails

POR read-only · no card data · financials owner-only · no secrets in git/handoff.
