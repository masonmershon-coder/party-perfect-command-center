# API route authorization inventory

Generated for PP-SEC-001. Default = PRIVATE. Cache for private routes: `private, no-store`.

| Path | Methods | Class | Auth | Sensitivity | File |
|------|---------|-------|------|-------------|------|
| `/api/agents/[id]/chat` | GET|POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/agents/[id]/chat/route.ts` |
| `/api/agents/[id]` | GET|PATCH|DELETE | PRIVATE | requireApiAuth/session/owner | ops | `app/api/agents/[id]/route.ts` |
| `/api/agents` | GET|POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/agents/route.ts` |
| `/api/ai-core/approvals/[id]` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/ai-core/approvals/[id]/route.ts` |
| `/api/ai-core/approvals` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/ai-core/approvals/route.ts` |
| `/api/ai-core/tasks` | POST|GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/ai-core/tasks/route.ts` |
| `/api/auth/google-ads/callback` | GET | PUBLIC | none (intentional) | low | `app/api/auth/google-ads/callback/route.ts` |
| `/api/auth/meta/callback` | GET | PUBLIC | none (intentional) | low | `app/api/auth/meta/callback/route.ts` |
| `/api/auth/session` | GET|POST|DELETE | PRIVATE | requireApiAuth/session/owner | ops | `app/api/auth/session/route.ts` |
| `/api/bookkeeping` | GET|POST | PRIVATE | requireApiAuth/session/owner | high | `app/api/bookkeeping/route.ts` |
| `/api/catch-up` | GET|POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/catch-up/route.ts` |
| `/api/connections` | GET|POST|DELETE | PRIVATE | requireApiAuth/session/owner | high | `app/api/connections/route.ts` |
| `/api/cron/social` | GET | MACHINE | bearer/signature | ops | `app/api/cron/social/route.ts` |
| `/api/cron/weekly-recap` | GET | MACHINE | bearer/signature | ops | `app/api/cron/weekly-recap/route.ts` |
| `/api/design/catalog` | GET|POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/catalog/route.ts` |
| `/api/design/coach` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/coach/route.ts` |
| `/api/design/command` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/command/route.ts` |
| `/api/design/generate` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/generate/route.ts` |
| `/api/design/media/[id]` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/media/[id]/route.ts` |
| `/api/design/product-photo` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/product-photo/route.ts` |
| `/api/design` | GET|DELETE | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/route.ts` |
| `/api/design/tools` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/tools/route.ts` |
| `/api/design/upload` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/design/upload/route.ts` |
| `/api/emails/[id]/draft-reply` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/emails/[id]/draft-reply/route.ts` |
| `/api/emails/[id]` | PATCH|GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/emails/[id]/route.ts` |
| `/api/emails` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/emails/route.ts` |
| `/api/export/github` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/export/github/route.ts` |
| `/api/google-ads/setup` | GET|POST | PRIVATE | requireApiAuth/session/owner | high | `app/api/google-ads/setup/route.ts` |
| `/api/grok` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/grok/route.ts` |
| `/api/health` | GET | PUBLIC | none (intentional) | low | `app/api/health/route.ts` |
| `/api/inventory` | GET|POST|PATCH | PRIVATE | requireApiAuth/session/owner | ops | `app/api/inventory/route.ts` |
| `/api/jobs/apply` | POST | PUBLIC | none (intentional) | low | `app/api/jobs/apply/route.ts` |
| `/api/jobs/resume/[id]` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/jobs/resume/[id]/route.ts` |
| `/api/jobs` | GET|DELETE | PRIVATE | requireApiAuth/session/owner | ops | `app/api/jobs/route.ts` |
| `/api/live-check` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/live-check/route.ts` |
| `/api/marketing` | GET|POST|PATCH | PRIVATE | requireApiAuth/session/owner | ops | `app/api/marketing/route.ts` |
| `/api/meta/durable-env` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/meta/durable-env/route.ts` |
| `/api/meta/setup` | GET|POST | PRIVATE | requireApiAuth/session/owner | high | `app/api/meta/setup/route.ts` |
| `/api/payments/square-link` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/payments/square-link/route.ts` |
| `/api/por/availability` | GET|POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/por/availability/route.ts` |
| `/api/por/balance` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/por/balance/route.ts` |
| `/api/por/catalog/search` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/por/catalog/search/route.ts` |
| `/api/por/contract` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/por/contract/route.ts` |
| `/api/por/customer-history` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/por/customer-history/route.ts` |
| `/api/por/customer` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/por/customer/route.ts` |
| `/api/por/inventory-lookup` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/por/inventory-lookup/route.ts` |
| `/api/por/sync/catalog-images` | POST|GET | MACHINE | bearer/signature | ops | `app/api/por/sync/catalog-images/route.ts` |
| `/api/por/sync/catalog` | POST | MACHINE | bearer/signature | ops | `app/api/por/sync/catalog/route.ts` |
| `/api/por/sync/crm` | POST|GET | MIXED | session GET + machine POST | ops | `app/api/por/sync/crm/route.ts` |
| `/api/por/sync/health` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/por/sync/health/route.ts` |
| `/api/por/sync/postgres` | POST|GET | MIXED | session GET + machine POST | ops | `app/api/por/sync/postgres/route.ts` |
| `/api/por/sync/reservations` | POST | MACHINE | bearer/signature | ops | `app/api/por/sync/reservations/route.ts` |
| `/api/por/sync` | GET|POST | MIXED | session GET + machine POST | ops | `app/api/por/sync/route.ts` |
| `/api/quote/availability` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quote/availability/route.ts` |
| `/api/quote/candidates` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quote/candidates/route.ts` |
| `/api/quote/from-matches` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quote/from-matches/route.ts` |
| `/api/quote/from-text` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quote/from-text/route.ts` |
| `/api/quote/guard` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quote/guard/route.ts` |
| `/api/quote/match-photo` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quote/match-photo/route.ts` |
| `/api/quote/remember-match` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quote/remember-match/route.ts` |
| `/api/quote` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quote/route.ts` |
| `/api/quotes/[id]` | GET|PATCH|DELETE | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quotes/[id]/route.ts` |
| `/api/quotes` | GET|POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/quotes/route.ts` |
| `/api/reports` | GET|POST | PRIVATE | requireApiAuth/session/owner | high | `app/api/reports/route.ts` |
| `/api/send-sms` | GET|POST | PRIVATE | requireApiAuth/session/owner | high | `app/api/send-sms/route.ts` |
| `/api/sms/inbound` | POST|GET | MACHINE | bearer/signature | ops | `app/api/sms/inbound/route.ts` |
| `/api/social/[kind]/[id]/draft-reply` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/social/[kind]/[id]/draft-reply/route.ts` |
| `/api/social/[kind]/[id]/reply` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/social/[kind]/[id]/reply/route.ts` |
| `/api/social/[kind]/[id]` | PATCH | PRIVATE | requireApiAuth/session/owner | ops | `app/api/social/[kind]/[id]/route.ts` |
| `/api/social` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/social/route.ts` |
| `/api/stats` | GET | PRIVATE | requireApiAuth/session/owner | ops | `app/api/stats/route.ts` |
| `/api/tasks/[id]` | PATCH|DELETE | PRIVATE | requireApiAuth/session/owner | ops | `app/api/tasks/[id]/route.ts` |
| `/api/tasks/[id]/run` | POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/tasks/[id]/run/route.ts` |
| `/api/tasks` | GET|POST | PRIVATE | requireApiAuth/session/owner | ops | `app/api/tasks/route.ts` |

## Notes
- Middleware excludes `/api/*` from host matcher; route-level auth is mandatory.
- `/api/connections` list never dumps all connections without tokens; `sessionToken` only on create or when client already presented tokens.
- POR sync POST remains `Bearer POR_SYNC_SECRET`; GET requires session.