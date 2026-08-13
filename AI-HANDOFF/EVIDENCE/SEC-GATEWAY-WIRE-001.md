# SEC-GATEWAY-WIRE-001

**Status:** implemented in-repo · `READY_FOR_VERIFICATION` · **not deployed**  
**Owner:** Cursor · **Verifier:** Codex  
**Date:** 2026-08-13

## Objective

Wire Matter `evaluate()` at the HTTP boundary so tier/role/agent policy is mechanical, not just agent-task. Unlisted resources fail closed at tier 4. MANAGER refused tier-3. Decisions in `SECURITY_AUDIT.jsonl`. Do not lock remote employees out of day-to-day CC.

## Change

- `lib/matter-gateway.ts` — TS mirror of `AI-HANDOFF/matter/security-gateway.mjs` (`RESOURCE_TIER`, `ROLE_MAX_TIER`, `AGENT_SCOPE`, `evaluate`, `screenUntrusted`)
- `lib/matter-http.ts` — `matterHttpGate()` + CC permission → Matter resource map
- `lib/api-auth.ts` — every `requireApiAuth` call also runs Matter gate
- CC session map: employee → SHOWROOM (tier 2), owner → OWNER. Owner PIN is **not** Matter `approval_granted`.
- Day-to-day ops map to tier ≤2 (`inventory-read`, `customer-read`, `task`, `health`). Bookkeeping → `payment` (owner only). Never map CC routes to `credential` / `security-config` / `billing`.
- `app/api/security/gateway-check/route.ts` — owner probe using caller’s mapped role (no role impersonation)

## Evidence expected by task

| Check | Result |
|-------|--------|
| MANAGER + `por-write` at HTTP gate | denied `role_tier_exceeded` (403) |
| Unlisted resource (`firewall-admin`, `sql-shell`) | `fail_closed_unlisted_resource` tier 4 |
| SHOWROOM + `inventory-read` | allowed (employee quoting/inventory still works) |
| Decisions in `AI-HANDOFF/SECURITY_AUDIT.jsonl` | `kind: matter_http` lines appended by `matterHttpGate` |

## Tests

```
npx tsx scripts/test-matter-http-gateway.ts
npm run test:security
```

## Known limits

- Not deployed.
- Vercel filesystem may not persist `SECURITY_AUDIT.jsonl`; gate still enforces; audit is best-effort off-box.
- Keep `lib/matter-gateway.ts` in lock-step with `AI-HANDOFF/matter/security-gateway.mjs`.
