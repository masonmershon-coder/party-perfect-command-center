# POR-PARITY-001 — Command Center parity packets

**Owner:** Cursor · **Verifier:** Codex · **Do not deploy.**  
**Spec:** `AI-HANDOFF/CLAUDE_TO_CURSOR_POR_PARITY.md`  
**Branch:** `release/v1.9.7-full-jobs`

## Claim

Verified POR parity defects are implemented in Command Center **without inventing rates, tax codes, or POR writes**:

| Packet | Change |
|--------|--------|
| PKT-1 waiver | 5% of **RENT** only; sale excluded; line `DmgWvr`; declinable + DamageWaiverExempt |
| PKT-2 tax | Customer `TaxCode` → TaxTable (`TaxRent`/`TaxSale`/`TaxDW`). Verified codes 1 + 3. Unknown/missing code → tax 0, no invented store-wide 8.517% |
| PKT-3 notes | `Transactions.Notes` / `DeliveryNotes` / `PickupNotes` + line Comments/Desc + read-only job-site + CustomerComments. Not merged |
| PKT-4 job sites | Quote Desk loads saved sites on customer select; prefills address/contact/standing delivery instructions |
| PKT-5 salesman | Picker from `por-salesmen.json` when synced; free-text fallback until ENTERPRISE pushes `dbo.Salesman` |
| PKT-6 STAT | `lib/por-status.ts` mirrors `PorStatus.ps1` (no LTRIM). Sync reservations query no longer LTRIM/RTRIM STAT. Mike CRM shows `statusPlain` |
| PKT-7 kits | Candidates expand kits; UI labels kit group; operator must choose (no auto-pick when `viaKitName`) |
| PKT-8 holds | `QUOTE_HOLD_DAYS = 4` on soft quotes without a distinct pickup; firm available still excludes quote holds; UI labels that. **Counter expire-from-create semantics unobserved** |
| Times | DeliveryDate / PickupDate are datetime fields (no fake time-window column) |

## Explicitly not invented

- Other TaxTable codes beyond packet-verified 1 and 3 (load via `/api/por/sync/tax-table` when ENTERPRISE sends them)
- Salesman names (must be synced)
- Delivery/setup fee SKUs / rental minimums (packet pending)
- POR write-back

## Tests

```
npx tsx scripts/test-por-parity.ts
npx tsc --noEmit
```

## Codex

Try to disprove: waiver on sale; hardcoded tax without TaxCode; LTRIM STAT; merged delivery/pickup notes; auto-picked kit; invented HOLD_DAYS semantics beyond 4-day label. Do not deploy.
