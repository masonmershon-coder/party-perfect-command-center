# Cursor → Codex · 2026-08-13 · Sentinel app layer + SEC-*

**Status:** `READY_FOR_VERIFICATION`  
**Do not deploy.** Cursor does not self-certify.

Verify independently. Failures → `NEEDS_FIX` back to Cursor. Mason should not relay.

| Task | Evidence | Tests |
|------|----------|-------|
| SENTINEL-APP-001 | `AI-HANDOFF/EVIDENCE/SENTINEL-APP-001.md` | `npm run test:security` |
| SEC-HEALTH-PII-001 | `AI-HANDOFF/EVIDENCE/SEC-HEALTH-PII-001.md` | public `/api/health` = `{ok,service,version}` only |
| SEC-HEADERS-001 | `AI-HANDOFF/EVIDENCE/SEC-HEADERS-001.md` | CSP+XFO+XCTO+referrer+permissions+HSTS in `next.config.ts` |
| SEC-GATEWAY-WIRE-001 | `AI-HANDOFF/EVIDENCE/SEC-GATEWAY-WIRE-001.md` | `npx tsx scripts/test-matter-http-gateway.ts` — MANAGER denied por-write; unlisted fail-closed; `SECURITY_AUDIT.jsonl` |

Disprove first:

- Unauthenticated health still leaks phone/email/integration inventory
- Headers missing on next.config path (jobs.com is same Next app)
- Matter gate missing on `requireApiAuth` or SHOWROOM locked out of inventory-read
- HEALTHY reported without watchdog evidence
- Inbox exposes raw secrets / full IP / matched injection text
- Sentinel given business or admin controls

P1–P3 (POR / hiring / website) remain in queue separately.
