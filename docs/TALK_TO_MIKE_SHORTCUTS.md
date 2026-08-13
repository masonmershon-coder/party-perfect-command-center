# Talk to Mike — iOS Shortcut provisioning (V1)

Cloud intake is `https://partyperfect.app`. Works on office Wi-Fi, home Wi-Fi, 5G, VPN, and travel. No Party Perfect LAN required.

**Do not put real tokens in this file, git, tests, or AI-HANDOFF.**

## Env (Vercel / secret store only)

| Name | Purpose |
|------|---------|
| `MIKE_INTAKE_MASON_TOKEN_SHA256` | SHA-256 of Mason device token |
| `MIKE_INTAKE_JOSH_TOKEN_SHA256` | SHA-256 of Josh device token |
| `MIKE_INTAKE_WORKER_TOKEN_SHA256` | SHA-256 of Mac outbound worker token |
| `MIKE_INTAKE_MASON_REVOKED` / `MIKE_INTAKE_JOSH_REVOKED` | `true` to revoke independently |
| `SUPABASE_URL` | existing project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | existing service role (server only) |
| `DATABASE_URL` | existing transaction pooler |

Hash a token (stdin → hex):

```bash
printf '%s' "$TOKEN" | node scripts/hash-mike-intake-token.mjs
```

Generate a high-entropy token locally (example): `openssl rand -base64 48`

## Shortcut names

1. **Talk to Mike — Mason**
2. **Talk to Mike — Josh**

Each shortcut stores **one** device token in iOS (Ask Each Time off). Authorization header only. Never a query parameter.

## Shared flow

1. Generate UUID → `IdempotencyKey`
2. Record Audio (m4a / AAC)
3. Save temporary file
4. **CREATE** `POST https://partyperfect.app/api/mike/intake`  
   Header: `Authorization: Bearer <DEVICE_TOKEN>`  
   JSON: `{ "idempotencyKey": "<uuid>", "contentType": "audio/mp4", "bytes": <fileSize>, "durationSeconds": <optional> }`
5. **Upload** the audio with the returned `upload.method` + `upload.url` + `upload.headers` (do not proxy through the app)
6. **COMPLETE** `POST https://partyperfect.app/api/mike/intake/complete`  
   Header: same Bearer  
   JSON: `{ "messageId": "<from create>", "idempotencyKey": "<same uuid>", "sha256": "<optional hex>" }`
7. Show: `Sent to Mike — <shortId>`
8. Delete the temporary local recording

Optional status: `GET https://partyperfect.app/api/mike/intake/<messageId>` with the same Bearer (only that sender’s row).

## Failure copy

`Couldn't reach Mike — Retry / Save Recording`

Retry may reuse the **same** idempotency UUID. Same content → original message/status. Different content with the same key → rejected.

## Placeholders for Claude Shortcut build

| Shortcut | Token placeholder | Sender |
|----------|-------------------|--------|
| Talk to Mike — Mason | `$MIKE_INTAKE_MASON_TOKEN` | mason |
| Talk to Mike — Josh | `$MIKE_INTAKE_JOSH_TOKEN` | josh |

Worker (Mac, not a Shortcut): `$MIKE_INTAKE_WORKER_TOKEN` → `POST /api/mike/intake/worker/lease|ack|fail|heartbeat`

## Capability boundary

Device tokens are **intake-only**. They cannot: read the other sender, invoke agents, approve protected actions, access POR, or use Command Center owner APIs.
