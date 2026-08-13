# WEBSITE-RATES-TRACE-001

**Owner:** Cursor · **Do not change presentation from this trace alone.**  
**Date:** 2026-08-13T17:51:20.026Z  
**POR catalog:** 2026-08-06T00:00:00Z · 8979 SKUs · source POR ItemFile export +NUM  
**Website sample:** 18 categories · 958 listing rows from https://www.partyperfecteventrental.com/equipment.asp

## Decision

Do **not** invent rates. Do **not** change POR pricing logic.  
Website listing rates that match POR SKU keys should stay as-is.  
Blank website rates where POR has a rate are a **display gap** — do not copy POR rates onto the public site in this pass (call/showroom quote remains valid).

## Counts

| Bucket | Count |
|--------|------:|
| Website rate matches POR (same SKU key, cents) | 946 |
| Website rate ≠ POR rate (same SKU) | 1 |
| Website blank, POR rate > 0 | 0 |
| Website blank, POR rate 0 / kit-style | 0 |
| Website key not in POR catalog | 11 |
| Listing rows sampled | 958 |

## Blank website + POR has rate (sample)

_None in this sample._

## Rate mismatch (sample)

| SKU | Name | Website | POR/day | Category |
|-----|------|---------|--------:|----------|
| 221420 | Turbo Misting Fan *delivery only | 495 | 350 | Climate Control - Power |

## Categories sampled

- 162 Inspiration
- 1 Bars & Bar Backs
- 52 Climate Control - Power
- 25 Flatware
- 101 Games
- 165 Lamps
- 30 Miscellaneous Rentals
- 50 Napkin Rings
- 40 Tables
- 95 Trade Show Booth and Conventions
- 160 EXCLUSIVE PRINTS
- 28 Linen Napkins
- 154 80'S - Design Theme Props
- 66 Accent Tables
- 49 Accent/ Side Chairs
- 103 Aisle Runners
- 122 Area Rugs
- 139 Artisan Crystal Goblets
