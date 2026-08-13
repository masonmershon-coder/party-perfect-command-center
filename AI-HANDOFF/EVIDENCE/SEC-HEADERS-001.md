# SEC-HEADERS-001

**Status:** implemented in-repo · `READY_FOR_VERIFICATION` · **not deployed**  
**Owner:** Cursor · **Verifier:** Codex  
**Date:** 2026-08-13

## Objective

partyperfect.app and partyperfectjobs.com were missing CSP, X-Frame-Options (or frame-ancestors), X-Content-Type-Options, Referrer-Policy, and Permissions-Policy (HSTS only). Add via `next.config.ts` `headers()` without breaking Design Studio / Meta / jobs apply.

## Change

- `lib/security-headers.ts` — header set + strict API CORS allowlist
- `next.config.ts` — `headers()` applies the set to `/:path*` (both hosts share this Next app; jobs.com is a rewrite)
- `middleware.ts` — API CORS only for allowlisted first-party origins (no `*`). Legacy `/api` hosts are not redirected (Twilio/POR webhooks).

CSP allowlist identified before lock-down: fal.ai / fal.run, Vercel Blob, Upstash, Meta Graph, Google OAuth, xAI, Twilio, Supabase, Vercel live. `script-src` keeps `'unsafe-inline' 'unsafe-eval'` for Next. Camera/mic stay `(self)` for jobs video + Mike voice. `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`.

## Tests

```
npm run test:security
```

- regression hook asserts all six header names + next.config wiring
- CORS deny for foreign origin; allow partyperfect.app / partyperfectjobs.com

## Known limits

- Not deployed — `curl -I` on live hosts will still show HSTS-only until release.
- CSP is intentionally not nonce-strict yet (Next inline). Can tighten after Design Studio soak.
