# AI CORE — Shared Data Contract (P1)

The **neutral, vendor-independent** foundation for Mershon AI. Every agent, the meeting pipeline, the
future gateway/PWA, the future native client, and any family member's persona build against **this** —
not each other's chat. Schema: `supabase/migrations/0003_ai_core.sql`. Access: `lib/ai-core.ts`.

**AI Core is neutral. It is NOT named after Matter or Mike.** Personas run *on top* of it.

## The one rule that prevents vendor lock-in
**If it matters, it becomes a typed record here (Task / Approval / BrainRecord / Meeting / Artifact /
AuditEvent) with a status and a `domain` — never left in a chat.** Swap Claude/OpenAI/Grok/Cursor/local
models anytime; memory stays. (Passes the test: any model, the Mac, or the iPhone can disappear and the
architecture survives.)

## Four separate concepts (do not conflate)
| Concept | Meaning | Example |
|---|---|---|
| **actor** | the authenticated *identity* | Mason |
| **persona** | the app-layer AI the user addresses (NOT in schema) | Matter · Mike |
| **domain** | whose *context + authority* the work belongs to | mershon_personal · party_perfect |
| **executor** | the *worker* that does it | Claude · Cursor · ChatGPT · Grok · Human |

```
actor: Mason   persona: Matter   domain: mershon_personal   executor: Claude
actor: Mason   persona: Mike     domain: party_perfect      executor: Claude
```
Same worker, same person — different persona/domain. The worker is interchangeable; the **domain**
decides what Brain/context is in scope, what tools are allowed, and whose approval applies.

## ⚖️ ARCHITECTURAL RULE — IDENTITY GOVERNS DOMAIN ACCESS
**A client may *request or indicate* a persona/domain, but the future Gateway MUST validate the
authenticated actor's authority and derive/approve the effective domain. A client-supplied `domain`
string is NEVER authorization.**
- Example: "Matter, have Mike summarize what I need at Party Perfect tomorrow" works **only because
  Mason is authenticated and authorized for both `mershon_personal` and `party_perfect`** — not because
  a client sent `domain=party_perfect`.
- P1 doesn't enforce per-actor authorization yet (that's the future identity layer), but every record
  carries `domain` + `created_by`/`actor`, so the enforcement layer bolts on with **no core redesign.**

## Domains
| domain | meaning | persona (app-layer) |
|---|---|---|
| `party_perfect` | business ops (POR, quotes, Command Center) | **Mike** |
| `mershon_personal` | Mason's personal / family projects | **Matter** |
| `mershon:<member>` | a family member's own namespace | their bot |

`domain` is **NOT NULL, no default** — every write states its domain, so personal data can never leak
into business context (or vice versa).

## Entities (7 tables, `ai_core` schema)
`tasks` (universal work object) · `approvals` (choke point; own `domain`) · `brain_records` (knowledge
WITH status; long-form via `doc_ref` to git markdown) · `meetings` (index) · `artifacts` (pointers to
big files on SSD/Blob/iCloud) · `audit_log` (append-only, domain-attributable) · `projects` (grouping).

## Task = the universal work object
`domain · type · source · title · intent · input_context(refs, not copies) · suggested_executor ·
assigned_executor · execution_mode · status · approval_required · priority · due_date · result ·
output_artifacts · created_by`. `execution_mode ∈ {human_handoff, manual_agent, automatic_agent}` —
today everything is `human_handoff`; **automatic dispatch drops in later with zero schema change.**

## Security / RLS (P1 baseline, not the full engine)
- `service_role` (gateway/loader/workers): full.
- `authenticated` (business staff): **read-only, `domain='party_perfect'` only.**
- **Personal domains (`mershon_personal`, `mershon:*`) are service_role-only** until the identity layer exists — the leak-prevention boundary.
- **Future (no core redesign):** `ai_core.actor_permissions(actor, allowed_domains[], tool_permissions, scope)` + `ai_core.can_access(domain)` the policies switch to.

## Integrity protections (enforced at the database boundary)
1. **Cross-domain referential integrity — composite FKs `(id, domain)`.** A child can only reference a
   parent in the **same domain**. Enforced on: `approvals→tasks`, `artifacts→tasks`, `artifacts→meetings`,
   `brain_records→(meetings, projects, supersedes)`. So `approvals.domain='party_perfect'` pointing at a
   `mershon_personal` task is **rejected by the database**, not just by app code. (Null child refs are
   allowed — a standalone approval/artifact is fine.) Deleting a referenced parent is restricted (P1
   rarely deletes; `approvals` cascade-delete with their task).
2. **`audit_log` is append-only.** A trigger (`ai_core.audit_append_only`) **rejects UPDATE and DELETE for
   every role — including the app's `service_role`.** INSERT is allowed (service_role/gateway). The only
   way to mutate history is an **admin/superuser** temporarily disabling the trigger
   (`alter table ai_core.audit_log disable trigger user;`) — the documented emergency-maintenance path.
   `authenticated` is additionally `revoke`d update/delete.

## Deferred (NOT in P1)
Gateway · PWA · native app · intent/wake-word routing · automatic dispatch behavior · identity/permissions
engine · event/notification engine · vector store. **Nothing here is applied to the live DB or touches POR**
until Mason approves.
