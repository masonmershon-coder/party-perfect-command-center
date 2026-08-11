# MATTER — Shared Data Contract (P1)

The neutral, vendor-independent foundation for the Party Perfect AI OS. Every agent, the meeting
pipeline, the future gateway/PWA, and the future native Matter app build against **this** — not each
other's chat. Schema: `supabase/migrations/0003_matter_core.sql`. Access: `lib/matter.ts`.

## The one rule that prevents vendor lock-in
**If it matters, it becomes a typed record here (Task / Approval / BrainRecord / Meeting / Artifact /
AuditEvent) with a status and a `domain` — never left in a chat.** Swap Claude/OpenAI/Grok/Cursor
anytime; company memory stays.

## AGENT IDENTITY ≠ DOMAIN  (critical distinction)
- **Agent / executor** = the *worker*: `claude`, `cursor`, `chatgpt`, `grok`, `human`, `mike`, `madison`, `gateway`.
- **Domain** = *whose context + authority* the work belongs to.

```
Agent: Claude   Domain: party_perfect     → Claude working as Party Perfect ops (persona "Mike")
Agent: Claude   Domain: mershon_personal  → same Claude, Mason's personal context (persona "Matter")
```
The worker is interchangeable; the **domain** decides what Brain/context is in scope, what tools are
allowed, and whose approval applies. **Personas (Mike/Matter) are app-layer names for domains — they
are NOT in the schema.** The infrastructure stays neutral and reusable.

## Domains
| domain | meaning | persona (app-layer) |
|---|---|---|
| `party_perfect` | business ops (POR, quotes, Command Center) | **Mike** |
| `mershon_personal` | Mason's personal / family projects | **Matter** |
| `mershon:<member>` | a family member's own namespace | their bot |

`domain` is **NOT NULL, no default** — every write states its domain, so personal data can never leak
into business context (or vice versa).

## Entities (7 tables, `matter` schema)
- **tasks** — the universal work object (meeting item, voice request, code request, analysis job all converge here).
- **approvals** — the choke point; carries its own `domain` for fast/secure filtering + audit.
- **brain_records** — knowledge WITH status (`DISCUSSION`→`POLICY`…); long-form stays in git markdown via `doc_ref`.
- **meetings** — queryable meeting index (audio/transcript are artifacts).
- **artifacts** — pointers to big files (audio/PDF/image) living on SSD/Blob/iCloud.
- **audit_log** — append-only; every action attributable to a `domain` + `actor`.
- **projects** — light grouping.

## Task = the universal work object
Carries: `domain · type · source · title · intent · input_context(refs, not copies) · suggested_executor ·
assigned_executor · execution_mode · status · approval_required · priority · due_date · result ·
output_artifacts · created_by`. Example:
> "Mike, the quote dashboard needs the lost-quote dropdown we discussed."
> → task { domain: party_perfect, type: software, source: voice, suggested_executor: cursor,
>          input_context: {brain_records:[…], meeting_id:…}, approval_required: true, status: READY }

`execution_mode` ∈ {`human_handoff`, `manual_agent`, `automatic_agent`} — today everything is
`human_handoff`; **automatic dispatch drops in later with zero schema change.**

## Future flow (P3+, not built now)
```
Matter/Mershon app OR Mike/PP client
        ↓
Shared Gateway (auth · intent)
        ↓  domain selection ("Mike…"→party_perfect, "Matter…"→mershon_personal)
Context / Brain boundary (only that domain's records)
        ↓
Task  →  Approval (if external/irreversible)
        ↓
Agent / tool executes  →  results write back to Brain
```

## Security / RLS (P1 baseline, not the full engine)
- `service_role` (gateway/loader/workers): full access.
- `authenticated` (business staff): **read-only, `domain='party_perfect'` only.**
- **Personal domains (`mershon_personal`, `mershon:*`) are service_role-only** until an identity layer exists — this is the leak-prevention boundary.
- **Future without core redesign:** a `matter.actor_permissions(actor, allowed_domains[], tool_permissions, read/write scope)` table + a `matter.can_access(domain)` helper the policies switch to. Core tables already carry `domain` + `created_by`, so it bolts on.

## Deferred (NOT in P1)
Gateway · PWA · native app · intent/wake-word routing · automatic dispatch behavior · users/permissions
engine · vector store · notifications. And **nothing here is applied to the live DB or touches POR**
until Mason approves.
