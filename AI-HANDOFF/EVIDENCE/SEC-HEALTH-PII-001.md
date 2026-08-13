# SEC-HEALTH-PII-001

**Status:** implemented in-repo · `READY_FOR_VERIFICATION` · **not deployed**  
**Owner:** Cursor · **Verifier:** Codex  
**Date:** 2026-08-13

## Objective

Unauthenticated `GET /api/health` must not leak operational PII or integration inventory. Public payload = `{ok, service, version}` only. Authenticated callers still get the full inventory.

## Change

`app/api/health/route.ts`

- No session → `{ ok, service: "party-perfect-command-center", version }`
- Session present (`readSession`) → previous operational payload (Twilio/POR/Redis/Grok/Meta/Google flags, including managerPhone / googleAdsAccount / twilioFrom)

Uptime monitors stay HTTP 200 without auth. Health is not a reconnaissance endpoint when unauthenticated.

## Tests

```
npm run test:security
```

Includes:

- `scripts/check-security-regression.mjs` — public health slice has no `managerPhone` / `googleAdsAccount` / `twilioFrom`
- `scripts/test-sentinel-app.ts` — same source assertion + authenticated helper still exists

## Known limits

- Not deployed. Live v1.9.7 still has the old public inventory until Mason approves a release.
- Authenticated payload still includes ops identifiers by design (task expected evidence).
