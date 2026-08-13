# Customer website conversion patches (Classic ASP)

`partyperfecteventrental.com` is **not** in this repo (legacy ASP / PR Hosting).
These snippets are drop-in copy for FTP when Mason/Claude have hosting access.

**Do not deploy** until the normal release review. Keep existing analytics
(`UA-136330006-1`, `G-XYPRW42H2M`), AdRoll, and any JSON-LD/schema already on
the ASP pages. Do not invent rates. Catalog stays POR-backed `equipment.asp`.

Source of truth for wording: `lib/website-positioning.ts`.

| File | Where to paste |
|------|----------------|
| `homepage-copy.html` | Home H1 / H2 / intro (remove “rental planners” / “planning/production company”) |
| `about-us-copy.html` | `about-us.asp` body (remove “design/planning duo”) |
| `event-design-services-copy.html` | `event-design-services.asp` (rental styling, not a planning firm) |
| `revieworder-empty.html` | Empty `reviewOrder.asp` cart — replace the timeout dead-end |
| `nav-careers.html` | Global nav + footer — Careers → https://partyperfectjobs.com |

Until ASP is patched, empty Get Quote can deep-link to:

`https://partyperfect.app/get-quote`

That page offers the same four choices and stores an inquiry for Quote Desk
(no rates). Existing PR Hosting web-quote email intake is unchanged.
