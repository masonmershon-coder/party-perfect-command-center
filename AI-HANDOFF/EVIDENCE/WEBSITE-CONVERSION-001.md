# WEBSITE-CONVERSION-001 — customer site conversion cleanup

**Owner:** Cursor · **Verifier:** Codex / Claude · **Do not deploy** until normal release review.  
**Branch:** `release/v1.9.7-full-jobs` · Production CC remains v1.9.7 (untouched).

## Claim

Verified conversion/positioning issues are fixed **in-repo** without a full website redesign, without inventing rates, and without changing POR pricing logic:

1. Planner-company language removed from canonical copy + ASP patch pack.
2. Party Perfect positioned as a full-service event rental company.
3. Empty Get Quote is no longer a dead-end: browse / start quote / request help / tent consultation.
4. Public catalog path stays POR-backed `equipment.asp`.
5. Blank/displayed website rates traced against POR before any presentation change (none applied).
6. Careers link → https://partyperfectjobs.com
7. Analytics / JobPosting JSON-LD / existing quote queue intake unchanged.

## Constraint: ASP site is off-repo

Live https://www.partyperfecteventrental.com is Classic ASP (PR Hosting). No `.asp` source in `grok-dashboard`. FTP patches live in `website-patches/`. Until FTP, empty-cart recovery is `https://partyperfect.app/get-quote`.

## In-repo deliverables

| Piece | Role |
|-------|------|
| `lib/website-positioning.ts` | Rental copy + LocalBusiness JSON-LD (not EventPlanner) |
| `app/get-quote/*` | Public guided empty-quote page + careers link |
| `POST /api/get-quote/inquiry` | Contact/event notes only — **no rates** |
| Quote Desk `WebsiteInquiriesPanel` | Showroom starts POR quote from inquiry; `/api/quotes` unchanged |
| `website-patches/` | Home / about / design / reviewOrder-empty / nav careers |
| `scripts/trace-website-rates.ts` | Live listing $ vs POR SKU |
| `scripts/test-website-conversion.ts` | Positioning + inquiry validation |

## What was not changed

- POR catalog / quote engine / tax / damage waiver / kit logic
- `/api/quotes` saved-quote intake
- PR Hosting web-quote email parser
- Jobs apply / JobPosting JSON-LD
- Live ASP analytics tags (UA-136330006-1 + G-XYPRW42H2M) — patches say keep them
- No Vercel `--prod`

## Rate trace (18 categories / 958 listings vs POR 8979 SKUs)

| Bucket | Count |
|--------|------:|
| Website $ matches POR (same SKU, cents) | 946 |
| Website $ ≠ POR | 1 (`221420` Turbo Misting Fan *delivery only — site $495 / POR $350) |
| Website blank, POR > 0 | 0 |
| Website key not in POR sample | 11 |

**Presentation not changed.** Mismatch left for showroom/POR review — do not invent a website rate. Full table: `EVIDENCE/WEBSITE-RATES-TRACE-001.md`.

## Tests

```
npx tsx scripts/test-website-conversion.ts   # PASS
npx tsx scripts/trace-website-rates.ts       # PASS (wrote rate trace)
npx tsc --noEmit
```

## Codex / Claude

Try to disprove: planner-company language still in new copy; empty quote still a dead-end; careers missing; inquiry invents rates; `/api/quotes` broken; JSON-LD is EventPlanner; POR rates invented onto the public catalog. Do not deploy. Do not FTP ASP without Mason.
