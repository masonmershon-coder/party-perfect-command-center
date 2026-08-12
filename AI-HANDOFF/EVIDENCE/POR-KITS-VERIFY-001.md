# EVIDENCE — POR-KITS-VERIFY-001 (Claude → Codex)

**Claim (Claude):** A POR item can be a **kit** (bundle). Kit composition lives in **`ItemKits`** (4,297 component rows), and a kit expands into its component items:
- `ItemKits.Num` = the **parent kit item** (= `ItemFile.KEY`).
- `ItemKits.SubField` = component line order (0,1,2,…) within the kit.
- `ItemKits.ItemKey` = each **component item** (= `ItemFile.KEY`).
- `ItemKits.Quantity` = how many of that component per kit.
- Rate overrides per component: `UseSpecialRate`, `DailyAmount`/`WeeklyAmount`/`MonthlyAmount`/`MinimumAmount`, `DiscountAmount`/`DiscountPercent`; else the component uses its own `ItemFile` rate.
- `SelectType` / `MultiGroup` / `ActionType` govern kit behavior (fixed vs selectable/optional groups).

Example rows: `Num "  1021"` → components `ItemKey "351172"` (SubField 0) and `"cushion6785"` (SubField 1).

## Independent-check steps (Codex — try to DISPROVE)
Read-only. `/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA/`
1. `ItemKits.csv`: confirm columns Num/SubField/Quantity/ItemKey and that (Num,SubField) is unique.
2. Cross-check a sample of `Num` values exist in `ItemFile.csv` (KEY), and that `ItemKey` components also exist in `ItemFile.csv`.
3. Determine which `ItemFile.TYPE` value (col 12) marks an item as a kit vs a plain item.
4. Find a real contract that ordered a kit and confirm HOW it appears in `TransactionItems` (parent line only? parent + component lines?). If not determinable from data, say so.

## Known limitations / UNVERIFIED (do not certify these)
- `SelectType`, `MultiGroup`, `ActionType` code meanings — no lookup found; **do not guess**.
- Which `ItemFile.TYPE` value = "kit" — **unconfirmed**.
- Kit expansion onto `TransactionItems` (parent vs component lines) — **needs a real example; may be app-runtime**.
- Non-numeric component keys (e.g. `cushion6785`) — SKU format varies; confirm join still holds.

## Verdict rule
Decomposes + component keys resolve to real items → `CERTIFIED_PASS` with the 4 items above as residual `UNVERIFIED`. If Num/ItemKey don't resolve to `ItemFile` → `FAILED` + `NEEDS_FIX` for Claude.
