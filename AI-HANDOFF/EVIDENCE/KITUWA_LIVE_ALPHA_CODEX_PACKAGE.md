# KITUWA live alpha — Codex verification package

**READY_FOR_CODEX_KITUWA_LIVE_VERIFY**

| Field | Value |
|-------|-------|
| LIVE URL | https://kituwa.app |
| Vercel project | `kituwa` (`prj_oaL4ROlPrqrw8qqEBU78EXREMkEF`) |
| Deployment ID | `dpl_98qkwVxpB4kBHoNHxx5CiUkM21SM` |
| Full SHA | `a01293f78a567c860883d435852fc5e86fc351f3` |
| Parent SHA | `c826d8b41c8d1a21d38dc9c067397226066d051e` |
| Branch | `agent/cursor/KITUWA-V1` |
| Deploy delta | `d822a1b` (Kituwa-only surface + durable fail-closed + PWA) · `a01293f` (lazy Grok build) |
| Evidence | `AI-HANDOFF/EVIDENCE/KITUWA_LIVE_ALPHA_2026-08-17.md` |

## Test commands (local)

```bash
npx tsx scripts/test-kituwa.mjs
npm run test:matter-registry
node scripts/test-api-auth-matrix.mjs
./node_modules/.bin/tsc --noEmit
```

## Live auth procedure (no secret in chat)

1. Wrong PIN: `POST https://kituwa.app/api/kituwa/session` `{"pin":"000000"}` → **401**
2. Correct PIN: retrieve `KITUWA_OWNER_PIN` from Vercel UI only → **200** + `kituwa_session` cookie
3. `GET /api/kituwa/state` with cookie → **200** + durable state payload
4. `POST /api/kituwa/talk` Integrity Customs brief → tasks persisted; external worker tasks **BLOCKED** or **ASSIGNED**, never fake **RUNNING**

## Isolation (kituwa.app)

- `POST /api/por/sync` → **404**
- `POST /api/time/admin/sync` → **404**
- `/time` path → Kituwa shell (rewrite), not employee Time login

## Storage proof

Production env `BLOB_READ_WRITE_TOKEN` PRESENT (store `kituwa-alpha`). After authenticated talk, reload state — `requests.length >= 1` survives new request (Blob-backed).

## Known limitations

- Real worker execution not certified live (heartbeat/trust gate).
- iPhone voice not tested on device this cycle.
- Mason must view PIN in Vercel; agent never logs it.
