# Supabase `por` mirror + Quote Desk building blocks

Branch: `claude/showroom-quote-desk`. POR stays system of record; this is the
read mirror the Command Center reads. **No card data here.**

## What's in this branch (Claude)
- `supabase/migrations/0001_por_core.sql` — the `por` schema (customers, contracts,
  contract_items, payments, items, salesmen). Original POR keys preserved.
- `lib/square-payment-link.ts` + `app/api/payments/square-link` — Square-hosted
  deposit/authorization links (no PAN ever touches us). Any signed-in staff may use.
- `lib/por-db.ts` + `app/api/por/customer-history` — read-only customer search +
  history over the mirror. **Financials gated to owner role only.**

## Install (needed for the query layer)
```
npm i pg
npm i -D @types/pg
```
(Square flow needs no deps — native fetch. Loader below needs `csv-parse` if built in JS.)

## Env
- `DATABASE_URL` — Supabase Postgres connection string (query layer)
- `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENV` (production|sandbox)

## For Cursor — bootstrap + live upsert (you own loading)
Load the brain CSVs and keep them live via the por-sync-agent using this exact
column → table mapping. Source CSVs:
`PARTYPERF/PARTY-PERFECT-BRAIN/15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA/`.
Existing `scripts/ingest-por-full.mjs` is the natural home.

| Table | CSV | Key | Notable columns (CSV → column) |
|---|---|---|---|
| `por.salesmen` | Salesman.csv | Number | Name→name, Inactive→inactive, Email→email |
| `por.customers` | CustomerFile.csv | KEY | NAME→name, NameAlias→company, CITY→city, Email→email, Salesman→salesman, CurrentBalance→current_balance (owner-only), NoEmail→no_email |
| `por.contracts` | Transactions.csv | CNTR | DATE→txn_date, Status→status, CUSN→customer_key, TOTL→total, PAID→paid, DeliveryDate/EventEndDate, Cancelled→cancelled |
| `por.contract_items` | TransactionItems.csv | Id | CNTR→cntr, ITEM→item (trim; joins items.num), QTY→qty, PRIC→price, TaxAmount→tax_amount |
| `por.payments` | PaymentFile.csv | Payment | Date→pay_date, CustNumb→customer_key, TransID→cntr, Amount→amount, Meth→method |
| `por.items` | ItemFile.csv | NUM | KEY→key, Name→name, Category→category, QTY→qty, QYOT→qty_out, RATE1→rate1 |

### HARD RULES
- **Never import** `PaymentFile.Encrypted`, `EncryptedCard`, `CCAlias`, or **any of `CheckCardFile`**.
- Status codes: `Q`=quote, `R`/`O`=reserved/out, `D`=done, `C`=cancelled.
- Financial columns (`current_balance`, contract `total`/`paid`, payment `amount`) are
  owner-only at the app layer — the query helpers already gate them via `includeFinancials`.
- Upsert on the PKs above (idempotent re-runs). Live sync = open + ±90d contracts;
  full history comes from the one-time brain bootstrap.
