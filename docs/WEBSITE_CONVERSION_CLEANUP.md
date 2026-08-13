# Customer website conversion cleanup

**Task:** WEBSITE-CONVERSION-001 · **Do not deploy** until review.

Party Perfect is a **full-service event rental company**, not a wedding/event
planning company. Planners are B2B customers.

## In this repo (ready for review)

| Piece | What it does |
|-------|----------------|
| `https://partyperfect.app/get-quote` | Empty Get Quote recovery: browse inventory · start a quote · request help · tent consultation |
| `POST /api/get-quote/inquiry` | Stores contact + event notes only — **no rates** |
| Quote Desk → Website inquiries | Showroom starts a POR-backed quote from the inquiry |
| `website-patches/` | FTP drop-ins for classic ASP (home / about / design / empty reviewOrder / careers nav) |
| `lib/website-positioning.ts` | Canonical rental copy + LocalBusiness JSON-LD (not EventPlanner) |
| `scripts/trace-website-rates.ts` | Compare live `equipment.asp` listing $ vs POR SKU rates |

## Not in this repo

`partyperfecteventrental.com` is legacy ASP. Live homepage still says “rental
planners” / “planning/production company” until FTP. Keep UA + GA4 + AdRoll +
any existing schema on those pages when patching.

## Rates

Website catalog keys match POR SKUs. Sampled listing rates often match POR
`ratePerDay`. Blank website rates are **not** filled from POR in this pass.
Showroom quotes from live POR. Do not invent rates. Do not change POR pricing.

## Careers

Public careers link: [https://partyperfectjobs.com](https://partyperfectjobs.com)

## Quote intake

PR Hosting web-quote emails and Command Center `/api/quotes` are unchanged.
The new inquiry store is additive (`web-quote-inquiries.json`).
