# KITUWA V2 preview — Codex verification package

**READY_FOR_CODEX_KITUWA_V2_PREVIEW_VERIFY**

Do **not** promote to production. Production `kituwa.app` remains SHA `a01293f78a567c860883d435852fc5e86fc351f3`.

| Field | Value |
|-------|-------|
| Product commit | `60b8528e4860bbc91b8789792ad0564df3e48e78` |
| Branch | `agent/cursor/KITUWA-V2-REPAIR` |
| Vercel project | `kituwa` (`prj_oaL4ROlPrqrw8qqEBU78EXREMkEF`) |
| Environment | **Preview only** |
| Deployment | `dpl_JBHFjLrub4ZzNsq2f8tWzWE8gVBH` |
| Unique URL | https://kituwa-gq5gxja48-party-perfect.vercel.app |
| Branch alias | https://kituwa-git-agent-cursorkituwa-v2-repair-party-perfect.vercel.app |
| Deployed git SHA | `60b8528e4860bbc91b8789792ad0564df3e48e78` (**matches product commit**) |
| Production | **untouched** — `kituwa.app` still V1 `a01293f`; `POST /api/matter/messages` on production → `{error: Not found}` |

Preview URLs use Vercel SSO (`all_except_custom_domains`). Use `vercel curl --deployment kituwa-gq5gxja48-party-perfect.vercel.app <path>` or a logged-in Vercel session. Do not print PINs.

Preview `KITUWA_OWNER_PIN` was rotated for this smoke (Preview env only). Retrieve the current Preview PIN from Vercel UI. Production PIN was not changed.

## Local tests (worktree)

```bash
npx tsx scripts/test-kituwa.mjs
node scripts/test-api-auth-matrix.mjs
npx tsc --noEmit
```

All passed on `60b8528`.

## Preview API smoke (2026-08-18)

| Check | Result |
|-------|--------|
| Unauth `GET /api/kituwa/state` | `{error: Unauthorized}` |
| Unauth `POST /api/matter/messages` | `{error: Unauthorized}` |
| `GET /api/por/sync` | `{error: Not found}` |
| `GET /api/time/session` | `{error: Not found}` |
| `/kituwa/sw.js` | 200, `skipWaiting` |
| PWA manifest | `name=KITUWA`, `display=standalone`, `start_url=/` |
| Wrong PIN | 401 |
| Correct Preview PIN | `{ok:true, sub:mason, caps:[view,task_create]}` |
| `POST /api/matter/messages` Integrity Customs | ack `status=blocked`, durable ids below |
| Idempotent replay same `client_message_id` | `duplicate=true`, same `message_id` |
| `GET /api/matter/tasks/:taskId` | parent + 3 subtasks, 2 events, 15 rejected workers |
| Task states | all `BLOCKED` — **no fake RUNNING** |
| Second `GET /api/kituwa/state` | same 7 task ids (refresh preserves) |
| Production `kituwa.app` | 200, V2 messages route **not** present |

### Durable ack from preview smoke

- `message_id`: `32feeb71-fabd-408f-9013-f5219d83d264`
- `task_id`: `afc5df9d-812e-4fbd-b412-a87f180b074e`
- `status`: `blocked`
- subtasks: email automation, checkout, verification — all `BLOCKED`

## Tower vs real state

Floors lit from real tasks (not idle animation):

- CLAUDE — 2 task(s) · blocked
- CODEX — 2 task(s) · blocked
- CURSOR — 3 task(s) · blocked
- GROK / LOCAL / MEMORY / OUTBOX — idle

Home after reopen still showed `Saved. message_id 32feeb71 · task_id afc5df9d. Execution is not running.`

### Finding (not a SHA mismatch)

Floor **stack** occupancy uses task category. Floor **detail** currently filters by assigned worker id. Blocked tasks with `HAT NONE` light Codex/Claude/Cursor but detail can say “No live task on this floor.” Representation is honest about BLOCKED; the office window filter is too strict until a worker is assigned.

## Mobile / PWA

- Shell CSS: `width: min(430px, 100%)` — phone-first column
- 44px `.kituwa-hit` targets on Enter / nav
- Manifest + apple-mobile-web-app meta + service worker present
- Browser pass: Home (Matter command) → Tower floors → Codex floor panel → task detail `afc5df9d…` → Home reopen preserved mission ids
- Cursor browser is Chromium, not physical Mobile Safari. Codex should Add to Home Screen on iPhone if a device pass is required.

## Storage caveat

`BLOB_READ_WRITE_TOKEN` is shared Production + Preview + Development. Preview writes go to the same Blob store as `kituwa.app`. Do not treat preview as an isolated data plane.

## Holds (unchanged)

`PAID_AUTONOMY=OFF` · `LIVE_V2=OFF` · `POR_WRITE=BLOCKED` · no fake RUNNING workers
