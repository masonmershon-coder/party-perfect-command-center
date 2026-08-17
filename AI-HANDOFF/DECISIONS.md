# DECISIONS

Approved decisions worth preserving. Keep short. No secrets.

## 2026-08-17 — Kituwa is Mason's OS; Matter is the intelligence

- **Decision:** `kituwa.app` is Mason's personal interface to Matter, not a Party Perfect app. Providers are temporary hats. No fake activity. Domain already purchased; attaching it is a separate production step.
- **Source:** Mason KITUWA V1 brief (2026-08-17).
- **Evidence:** `AI-HANDOFF/EVIDENCE/KITUWA_V1_ARCHITECTURE.md`

## 2026-08-17 — Brain reconciliation + verifier access (P0)

- **Decision:** Aug 13–17 work must be durable and independently verifiable (git commits + evidence + git bundles). Google Drive shared-knowledge sync is **not** present on this Mac; `brain-sync.mjs` is SYNC CODE READY but AUTOMATIC SYNC is NOT RUNNING until launchd recovery is certified and a real `BRAIN_SYNC_DEST` exists. Git remains source authority; POR remains business SoR; Drive/SSD sync is knowledge/evidence only. Codex obtains candidates via bundles when GitHub push is unavailable.
- **Source:** Mason BRAIN RECONCILIATION + VERIFIER ACCESS P0 (2026-08-17).
- **Evidence:** `AI-HANDOFF/PARTY_PERFECT_BRAIN_MANIFEST.json`, `AI-HANDOFF/BRAIN_INVENTORY_2026-08-17.json`, `AI-HANDOFF/BRAIN_SYNC_DESIGN.md`, `AI-HANDOFF/EVIDENCE/BRAIN_RECONCILIATION_COLD_START_2026-08-17.md`.

## 2026-08-17 — Time trusted-device persistence + Shadow Mode

- **Decision:** Ordinary employees use long-lived trusted-device sessions (not IP). No visible Sign Out/Switch Account. Logo press-and-hold (4s) opens support gate; only Time admins get Switch Account / Sign Out This Device. Shadow Mode: employees keep punching in Square; PP Time syncs Square→PP read-only for Shelly/Michelle/Mason until cutover. Prefer Square Labor Timecards API (hourly cron); no LLM in sync; no Square write-back.
- **Source:** Mason FINAL UX + Shadow Mode directives (2026-08-17).
- **Evidence:** `AI-HANDOFF/EVIDENCE/PP-TIME-TRUSTED_DEVICE_SHADOW_MODE_2026-08-17.md`.

## 2026-08-15 — Matter provider-neutral orchestration (FOUNDATIONAL)

- **Decision:** Matter owns jobs. AI providers are replaceable workers. Business agents (Mike, Madison, …) stay stable; underlying models/providers do not. Routing is by capability + health + evidence, never by hard-coded provider name. Policy is versioned (`MATTER_POLICY.json`); workers must ack before sensitive work. Availability is probed; scores stay null until enough real outcomes. Builder ≠ verifier for high-risk classes. Know≠apply for provider updates. Owner approval gates unchanged for money, customer sends, production/destructive, payroll, POR writes, credentials.
- **Source:** Mason MATTER — PROVIDER-NEUTRAL AUTONOMOUS ORCHESTRATION V1 (2026-08-15).
- **Evidence:** `AI-HANDOFF/EVIDENCE/MATTER_ORCHESTRATION_V1_AUDIT.md`, `AI-HANDOFF/matter/matter-registry.mjs`.

## 2026-08-11 — Shared handoff location

- **Decision:** Use repo-root `AI-HANDOFF/` in `grok-dashboard` as Claude ↔ Cursor coordination.
- **Why:** Command Center is Cursor’s primary workspace; Claude can read/write the same git tree / worktree.
- **Source:** Mason integration prompt; Cursor bootstrap when Claude had not yet created the folder.

## 2026-08-11 — POR remains system of record

- **Decision:** POR/Counter on ENTERPRISE is authoritative. App/Redis/Supabase/CSVs are mirrors only. No write-back to POR until Mason explicitly approves a future design.
- **Source:** Existing Party Perfect guardrails + POR 2.0 brief.

## 2026-08-11 — Cursor orientation mechanism

- **Decision:** Prefer `.cursor/rules` `alwaysApply` for handoff orientation; treat `sessionStart` hooks as best-effort only.
- **Why:** Known Cursor IDE race can drop `sessionStart.additional_context`.

## 2026-08-11 — Handoff reconciliation (Claude review of PP-HANDOFF-001)

- **Protocol canonical in `AGENTS.md`** (repo root; both Claude Code + Cursor auto-read). Claude removed its redundant `AI-HANDOFF/PROTOCOL.md`.
- **Archive standardized on `history/`** (Claude removed its `ARCHIVE/`).
- **Brain pointer added** in `09 - Claude Efficiency/BRAIN_STATUS_AND_ROADMAP.md` → this folder ("both linked").
- Note: Claude's `README.md` write overwrote Cursor's (uncommitted); kept as the Mason-facing explainer, references updated to AGENTS.md + history/.
- **PP-HANDOFF-001 → VERIFIED.**

## 2026-08-13 — AI cost ledger seed (Mason / USER_REPORTED)

- **Decision:** Owner AI Cost & Usage records these recurring amounts as **USER_REPORTED**, not provider-verified: Supabase $25/mo, Claude $100/mo, ChatGPT $20/mo, Grok $99/mo, Vercel/domain ~$10/yr (classification uncertain), Cursor unknown until verified (must not count as $0). Hardware purchases stay out of the recurring AI operating ledger. Dashboard observes/alerts only — no agent may change provider billing.
- **Source:** Mason OWNER-AI-COST-USAGE-001 (2026-08-13).

## 2026-08-13 — Customer site: rental company, not planners (Mason)

- **Decision:** Party Perfect is a **full-service event rental company**. Do not present as a wedding/event planning company. Planners are B2B customers. Empty Get Quote must offer guided choices (browse / start quote / request help / tent consultation). Careers → partyperfectjobs.com. No invented rates. No POR pricing changes. No deploy until review.
- **Source:** Mason Priority 3 (2026-08-13).

## 2026-08-13 — Jobs: Quick Apply removed (Mason)

- **Decision:** Party Perfect Jobs is **full application only**. The 60-second / Quick Apply path is **not** part of the product. Do not bring it back as a fallback, mobile path, feature flag, secondary CTA, or optional shortcut unless Mason explicitly changes this decision.
- **Why:** Short apply produced insufficient information to evaluate, contact, interview, and hire.
- **Restore target:** Pre-Quick-Apply / `f455daa` full validator + multi-step form (~2–3 min). No new hiring questions invented.
- **Source:** Mason priority Cursor task 2026-08-13; deploy approval same day (“get the original out there”).

## 2026-08-11 — Live relay (Mason-approved)

- **Decision:** Run `scripts/ai-handoff-relay.sh` for near-real-time notify + Claude auto-wake; gate with `AUTO_RELAY.enabled`; hard caps (90s debounce, 3 wakes/hour, `READY_FOR_CLAUDE*` only). Cursor wake = Notification Center + optional Cursor Automation.
- **Why:** Agents cannot share one chat process; filesystem + capped wake is the workable bridge.
- **Source:** Mason request to automate Claude↔Cursor keep-up.

## 2026-08-14 — Party Perfect Time V1 defaults (Mason plan)

- **Decision:** Time lives at `https://partyperfect.app/time` (PWA scope `/time`). Employee session cookie `pp_time_session` is separate from Command Center. PP Showroom (`8401 E 41st St, Tulsa OK 74145`) is seeded **inactive/unverified**; no punches until Mason verifies lat/long and approves migration `0009`. Square import is time-only (ignore wages). Mike status API is read-only. No Paychex send in V1.
- **Source:** Mason-approved Party Perfect Time V1 plan (PP-TIME-001).

## 2026-08-14 — Shelly-first timekeeping workflow (Mason)

- **Decision:** Employees never edit official timecards. All Fix My Time / absence / future time-off requests go to **Shelly's review queue** first. Shelly reviews, clarifies, remarks, approves/denies, and applies authorized corrections. Michelle has owner override + final payroll; do not flood Michelle with routine cleanup. Flow: EMPLOYEE → SHELLY CLEANUP → MICHELLE FINAL PAYROLL → PAYCHEX. Absence reports use simple employee reasons (Sick / Vacation / Personal / Other); paid-leave classification is administrative. PTO/vacation UI is eligibility-driven only — never show $0, “not eligible,” or advertise the benefit. In-app notifications + request conversation threads are official; SMS may still happen ops-side. Mike monitors queues **read-only** (Friday Shelly reminder; Monday payroll readiness).
- **Source:** Mason workflow update on PP-TIME-001 (2026-08-14).

## 2026-08-14 — Punch verification is evidence-first (Mason)

- **Decision:** Do **not** hard-block punches on geofence. Employees work at job sites and may lunch away from the office. Every punch captures server timestamp, optional GPS (never IP-as-location), trusted-proxy IP / office-egress match (`TIME_OFFICE_EGRESS_IPS`), and first-party trusted-device cookie (`pp_time_device`). Risk fields are **review signals only** (not guilt). Employees never see raw IP / risk scores. Default evidence retention: 365 days (`PUNCH_EVIDENCE_RETENTION_DAYS`).
- **Source:** Mason punch verification / time-theft signal update (2026-08-14).

## 2026-08-15 — Location only at punch moment (Mason)

- **Decision:** No continuous / background / 24/7 employee location tracking. Location is required **only** when the employee taps Clock In, Start Lunch, End Lunch, or Clock Out. Capture lat/long, GPS accuracy, GPS timestamp, server punch timestamp, trusted device ID, public IP, and office-network match on that punch — then stop. Never invent coordinates if permission is denied/unavailable; block the punch and show restore instructions. Geofence remains evidence, not a hard gate. Onboarding must state: location is used only at punch actions to verify time; Party Perfect does not track employees throughout the day. Mason + Michelle review punch-level GPS/IP/device/anomaly; Shelly does not need security-investigation telemetry.
- **Source:** Mason FINAL LOCATION RULE (PP-TIME-001, 2026-08-15).

## 2026-08-15 — Late Night tracking (Mason)

- **Decision:** Qualifying work in 7:00 PM–6:00 AM America/Chicago creates one Late Night occurrence per shift (no double-count across midnight). Late-night hours remain inside normal Regular/OT totals — not a separate hours bucket. Track lateNightCount, occurrence dates/shift ids, and lateNightFeeAmount. Fee is admin/owner-configurable; production dollar amount stays unresolved until Mason supplies it.
- **Source:** Mason FINAL PRE-LIVE PATCH (PP-TIME-001, 2026-08-15).

## 2026-08-15 — Final Time role matrix (Mason)

- **Decision:** Shelly = TIME_ADMIN (ops cleanup, employees, PIN/device, payroll readiness; no security telemetry). Mason = TIME_ADMIN + SECURITY_ADMIN (Shelly capabilities + security review/acknowledge; no Paychex/finalize). Michelle = OWNER (complete Time Admin + Security + Payroll finalize/overrides). Owner is a strict superset.
- **Source:** Mason FINAL PRE-LIVE PATCH (PP-TIME-001, 2026-08-15).

## 2026-08-14 — Time role separation: Shelly ops / Mason security / Michelle owner

- **Decision:** **Shelly** = timekeeping cleanup only (missed punches, Fix My Time, absences, time-off, clarifications, payroll-readiness cleanup). No default access to raw anti-theft telemetry (IP, risk scores, device-security history, impossible travel, fraud flags). **Mason** = primary security/time-theft oversight (new devices, multi-device, unusual IP/GPS, impossible travel, auth abuse); full punch evidence; HIGH alerts routed to Mason. **Michelle** = owner — complete ops + security + payroll. Severity LOW/MEDIUM/HIGH; LOW = evidence only; MEDIUM → Mason; HIGH → Mason + Michelle visibility. Never auto-accuse theft. Mike: ops flags for Shelly Friday; security flags separate for Mason/Michelle.
- **Source:** Mason final role separation + go-live prep (PP-TIME-001, 2026-08-14).

## 2026-08-14 — Shelly employee + PIN administration

- **Decision:** Shelly administers everyday Time employees: add employee (First/Last/Dept/PIN/leave eligibility; auto UUID; no employee# required for login), set/reset 4-digit PIN (hashed only — forgot PIN = set NEW PIN), revoke trusted devices / restart onboarding, deactivate (block clock-in + invalidate sessions + revoke devices; **preserve** punches/corrections/audit/payroll history). Setup statuses: NOT SET UP · INVITED · DEVICE REGISTERED · ACTIVE · INACTIVE. Shelly cannot grant Owner/security caps, access anti-theft dashboard, erase audit history, or manage Michelle/Mason protected accounts. Mason/Michelle retain security oversight; Michelle remains OWNER.
- **Source:** Mason Shelly employee + PIN management update (PP-TIME-001, 2026-08-14).

## 2026-08-14 — Party Perfect Time is self-contained

- **Decision:** `/time` is the standalone, role-aware application. Employee sees the small My Time / requests experience. Shelly signs into the same app and receives Review, Employees, Time Off, and Payroll tools. Mason receives Time Admin plus Security. Michelle receives complete owner/payroll/security access. Command Center remains an optional mirror/deep link over the **same `/api/time/*` backend**; Shelly never needs Command Center for normal Time administration. No duplicate Time data or workflows.
- **Source:** Mason architecture correction (PP-TIME-001, 2026-08-14).

---

## 2026-08-17 — PERMANENT: Business agents are roles, not providers (Matter policy 1.1.0)

**Decision.** Party Perfect business agents represent responsibilities, not AI vendors. Matter
dynamically assigns authorized workers, models and tools according to current capability, quality,
reliability, availability, privacy and cost. Providers are replaceable. Capabilities do not grant
authority. Deterministic software is preferred when intelligence is unnecessary. Matter controls
paid compute escalation and may reassign any business role to a better authorized worker without
changing the role's identity or history.

**Authoritative location:** `AI-HANDOFF/matter/MATTER_POLICY.json` (extended in place — no new
disconnected policy file). Version **1.1.0+b749d6f63bea** (content-addressed: any edit mints a new
version and previously-recorded acks correctly go stale).

**Executable, not just documented:**
- Cost ladder deterministic → local → low-cost → standard → frontier, applied **only among workers
  that already satisfy every hard requirement**, so cheap can never override safety or capability.
- Deterministic-first gate: a task needing no judgement returns `route: DETERMINISTIC_SOFTWARE`
  and wakes no model.
- Worker contract extended with `estimated_cost`, `latency_class`, `local_or_remote`,
  `data_boundaries`, `quality_history`, `verification_history` — defaulting to **UNKNOWN**, never
  fabricated. UNKNOWN cost is treated as *standard*, never as cheap.
- Matter owns escalation; workers may report a need but may not self-escalate into paid compute.

**Safety bug found and fixed during implementation:** the first deterministic-first gate treated an
*unrecognised* capability name as "deterministic", which let a permission-gated task (e.g. a POR
write) skip the eligibility checks. Now any task carrying `required_permissions`, a protected
action, or a verification requirement is barred from the short-circuit, and an unknown capability
name counts as thinking. Regression tests R1/R2 lock this in.

**Remaining hard-coded routes (classified):**
- `control-plane.mjs` `SUBSYSTEM_OWNER` (18 literals) — **ARCHITECTURAL LOCK-IN**, scheduled for
  provider-neutral replacement at V2 cutover.
- `matter/orchestrate.mjs` `WORKERS` + `dispatchParallel(["cursor","codex"])` (6 literals) —
  **ARCHITECTURAL LOCK-IN**, same cutover.
- Both left functioning deliberately: production workflows must not be broken for theoretical purity.
- `matter-registry.mjs` — **0 provider literals in routing logic**, asserted by test 9.

**Tests:** 13/13 provider-neutrality + cost routing; 17/17 existing V1 suite (no regressions).

---

## 2026-08-17 — ARCHITECTURE: BRIDGE BEFORE REPLACEMENT (Matter policy 1.3.0)

**Decision.** Party Perfect does not replace a proven legacy operating system merely to modernize
the employee experience. The preferred migration architecture is:

```
LEGACY SYSTEM → GOVERNED BRIDGE → NEW PARTY PERFECT / MATTER INTERFACE
→ CONTROLLED WRITES → READ-BACK VERIFICATION → GRADUAL AUTHORITY TRANSFER
→ OPTIONAL LEGACY RETIREMENT
```

A reusable pattern, applied first to **Square / Party Perfect Time**, then to **Point of Rental**.

**Authoritative location:** `AI-HANDOFF/matter/MATTER_POLICY.json`, extended in place —
version **1.3.0+111d69836ac9**. No new disconnected rule file was created.

### The POR clarification that changed

The old posture read as *"POR is read-only to AI, permanently."* That was right while we were
learning the system; it is now **too coarse**. The precise long-term rule:

- POR remains the **authoritative live operational source** until Mason explicitly changes that.
- POR is **not permanently read-only**. Matter may eventually write through **specifically tested,
  independently verified and explicitly authorized capabilities**.
- Authority is graduated **capability by capability**. Global POR write authority is never granted.
- **Capability does not imply permission** — already enforced in code, and a P0 self-grant bypass
  in that exact area was found and closed on 2026-08-17.

| Read capabilities (appropriate now) | Candidate future writes (each individually authorized) | Separately gated high-risk |
|---|---|---|
| `por_customer_lookup`, `por_inventory_lookup`, `por_availability_lookup`, `por_price_lookup`, `por_quote_read` | `por_quote_create`, `por_quote_update`, `por_customer_create_update`, `por_reservation_update`, `por_contract_update`, `por_print_quote` | payments, refunds, deletions, pricing overrides, contract cancellation, financial adjustments |

### Write safety standard (applies to any legacy system, not just POR)

```
REQUEST → STRUCTURED INTENT → PERMISSION CHECK → CURRENT READ → PROPOSED CHANGE
→ WRITE → REOPEN / READ BACK FROM THE LEGACY SYSTEM → COMPARE EXPECTED VS ACTUAL
→ VERIFIED SUCCESS OR CONFLICT/FAILURE → DURABLE AUDIT
```

**Never trust "save succeeded" alone.** Authoritative state must be read back and compared.
Every write records: who requested, initiating system, Matter task id, worker/tool, legacy record
id, before state, requested change, after state, verification result, timestamp, evidence ref.

### Identity and legitimacy

Automation must **never** be designed to conceal itself, impersonate an employee, bypass licensing
or security controls, or evade detection. Access is legitimate and authorized. Our audit preserves
the **actual initiating identity** (Mason, Shelly, Michelle, a named employee, Matter, or a specific
worker) even when the legacy system records the action through a licensed service account.

Integration order: supported API where reliable → governed database/service integration →
controlled UI automation when necessary. **API purity is not a requirement** when safe UI
automation is the practical way to perform an existing employee workflow.

### Matter exposes business capabilities

Other systems request `check availability`, `build quote`, `correct timecard`, `print contract` —
not Square/POR internals. One controlled integration layer instead of many improvised ones.

### Square / Party Perfect Time — the proving ground

Employees keep punching in **Square**. `Square → PP Time` carries live punches, breaks and timecard
data. `PP Time → Square` carries **only specifically authorized management corrections**, after the
write bridge is verified and approved. Employee punches migrate later. Every Square write is read
back and confirmed.

### What this decision does NOT do

**It authorizes no POR write.** Verified after the change: `por_authoritative_write` is still a
protected action, `por_write` still requires verification, **no worker holds `por_write`**, and
`por_write_status.authorized_today = false`. No live POR was touched, no test write performed,
no production routing changed.

### Components that already implement this pattern

| Component | Role in the bridge |
|---|---|
| `matter/matter-registry.mjs` | capability/permission separation; graduated authority is expressible today |
| `matter/trust.mjs` | capability trust levels (DECLARED→MEASURED→VERIFIED); a write capability can be required to be MEASURED |
| `matter/shadow-router.mjs` | shadow-before-live: compute the write plan without executing it |
| `matter/execution.mjs` | leases/DLQ so a half-finished write cannot vanish |
| `/Users/mikeai/Matter/por-bridge` | existing READ-ONLY POR bridge, verified 7/7 against real CNTRs |

### Gaps this decision exposes

1. **No read-back-verify implementation exists.** `sentinel/sentinel.mjs` is the only place with a
   read-back notion. The `WRITE → READ BACK → COMPARE` step is specified but unbuilt.
2. **No structured-intent schema** for a proposed legacy write.
3. **No capability-scoped write permissions** are defined yet (`por_quote_create` etc. exist only as
   names in policy).
4. **Provider neutrality holds:** no rule says Claude/Cursor/Claw operates POR. Matter selects
   dynamically. This must stay true when the bridge is built.
