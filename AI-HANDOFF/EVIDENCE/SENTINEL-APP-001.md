# SENTINEL-APP-001 — Command Center application layer

**Status:** implemented in-repo · `READY_FOR_VERIFICATION` · **not deployed**  
**Owner:** Cursor · **Verifier:** Codex  
**Date:** 2026-08-13

Architecture is owned by the approved Sentinel spec. This is display + HTTP only. No Sentinel redesign. No firewall/SQL/POR credentials. No general admin. No business authority. Defaults read-only. Remote employee usability preserved.

## Delivered

| Piece | Where |
|-------|--------|
| Security Inbox (owner) | `app/components/dashboard/security-section.tsx` + nav `security` ownerOnly |
| Employee health card | `security-health-card.tsx` on Dashboard Home (status only) |
| Sentinel event APIs | `GET/POST /api/sentinel/events`, `GET /api/sentinel/events/[id]`, `GET /api/sentinel/health`, `GET /api/sentinel/injection-status` |
| Role-aware views | employee: degraded/offline/unknown card; owner: inbox + drilldown + injection counts |
| Alerts + drilldown | redacted summaries; IPs/emails/phones/secrets stripped |
| Auth telemetry | hashed session (12 hex), IP `/24`, UA family only — `lib/sentinel-telemetry.ts` on `/api/auth/session` |
| Prompt-injection display | signal **counts/ids** only; jobs apply + get-quote screen via `screenUntrusted`, fail open for intake |
| Health never fake-green | `lib/sentinel-health.ts` — no HEALTHY without `AI-HANDOFF/sentinel/watchdog-health.json` fresh + `component=watchdog` |
| Regression hook | `npm run test:security` (`scripts/check-security-regression.mjs` + auth matrix + gateway + sentinel-app) |
| Headers + CORS | SEC-HEADERS-001 |
| Public health shrink | SEC-HEALTH-PII-001 |
| Matter HTTP gate | SEC-GATEWAY-WIRE-001 |

Collector `SECURITY_EVENTS.jsonl` is **read**, never rewritten. App events go to durable `sentinel-app-events.json` (append-only hash chain). Collector POST requires `SENTINEL_COLLECTOR_SECRET` (disabled/503 if unset).

## Tests

```
npm run test:security
npx tsc --noEmit
```

All passed locally 2026-08-13. Watchdog file absent → status `unknown`, banner “SECURITY MONITORING DEGRADED — Command Center remains available.”

## Out of scope / not done

- Independent deploy
- Sentinel collectors / watchdog / containment broker / analyst (Claude/Codex)
- Any spend
- Live POR write
