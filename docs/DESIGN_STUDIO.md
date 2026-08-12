# Madison Design Studio — subbot pipeline

June-style flow: **real catalog images → cached cutouts → one FAL staging call**.

```
LIVE CATALOG SYNC (~10 min)
  └─ rentable item: qty + rate + imageUrl
        │
   ┌────┴─ IMAGE-INGEST (`/api/por/sync/catalog-images`)
   │        sourceUrl hash unchanged? → SKIP
   │        new/changed? → fetch once → Blob mirror (`product-catalog/{sku}`)
   │
   ├─ CUTOUT (`fal-ai/birefnet/v2`, once per content hash)
   │        → transparent PNG in Blob (`product-cutouts/{hash}.png`)
   │
   … showroom: "blush + gold garden tablescape, gold chargers, white linen" …
   │
   ├─ RESOLVER (`lib/design-resolver.ts`) — local fuzzy match → SKUs + cutouts
   ├─ AVAILABILITY (`lib/design-availability.ts`) — in stock on date? swap sibling SKU
   ├─ STAGING (`lib/design-staging.ts`) — **only FAL spend** in happy path
   │     1 cutout → `fal-ai/bria/product-shot`
   │     2+ cutouts → `fal-ai/flux-pro/kontext/multi`
   └─ ESCALATE (Grok) — only when resolver confidence low or hard layout/style ask
```

## Ops

After each catalog push, ENTERPRISE agent calls:

`POST /api/por/sync/catalog-images` (Bearer `POR_SYNC_SECRET`)

Processes **40 SKUs per call** (round-robin cursor). Full catalog fills over successive sync cycles.

## Cache keys

| Store | Key |
|-------|-----|
| SKU → mirror/cutout | `product-image-cache.json` |
| Ingest cursor | `product-image-ingest-meta.json` |

## Design command

Text-only + **Design with real items** uses `runDesignPipeline()` in `/api/design/command`.

Staff photos still use look-board + Kontext; pipeline cutouts append as product refs.

## Website CTA

Replace tryjune → `https://partyperfect.app/?section=design` after quality sign-off.
