# Sentinel — Adversarial Architecture Review

**Area:** AI-HANDOFF · **Status:** Review complete · **NOT BUILT** · **Date:** 2026-08-13 · **Reviewer:** Claude
**For:** Matter (routing) · Cursor (eventual implementation) · Codex (independent challenge)

> Verdict: **APPROVE WITH CHANGES.** The role is right and the restraint in the proposal is unusually good. But as specified, Sentinel becomes the most attackable component in Party Perfect — because monitoring everything means *reading* everything, and reading everything is exactly how this system has already been hurt.
>
> Guidance leaned on: least privilege, separation of duties, fail-safe defaults, tamper-evident logging (NIST SP 800-92), and the OWASP LLM risk categories — prompt injection, insecure output handling, and **excessive agency**, which is the one that matters most here.

---

## The central objection

**A monitor that can act is an attack surface with a trigger attached.**

Party Perfect's own recent history proves this is not theoretical. In the last 48 hours this system produced: an ungated launchd trigger that spent money unprompted, an orphaned child process that kept spending after its parent was killed, a certification engine that produced a **false FAIL** because it mis-parsed its own oracle, a `git add -A` that swept unintended files into a commit whose message claimed otherwise, and a committed file that silently vanished from the working tree.

Every one of those was an automation acting on a wrong belief. Sentinel is an automation whose entire job is forming beliefs about danger and acting on them. It will inherit all of these failure modes and add new ones.

So the design question is not "what should Sentinel watch." It is **"what happens when Sentinel is wrong, and who can make it wrong on purpose."**

---

## TOP 10 RISKS — ranked

### 1. Containment becomes the attack (CRITICAL)
If Sentinel pauses work on suspicion, then anyone who can *create* suspicion has a denial-of-service. POR customer notes are replicated to the SSD; an applicant's résumé free-text reaches the hiring store. Write `ignore all previous instructions` into a customer note, and if Sentinel quarantines the batch, **replication stops and Command Center goes stale — from a text box a customer can type into.**

This is the single most important risk. The blast radius of a false positive must be smaller than the blast radius of the threat.

### 2. Prompt injection against the monitor itself (CRITICAL)
Sentinel reads the widest surface in the company: logs, resumes, customer notes, uploaded documents, agent output. All of it is attacker-influenceable. If any LLM component of Sentinel receives that raw text, the monitor is the softest target in the system — and it is the component people will trust most.

### 3. Aggregation makes Sentinel the richest target (HIGH)
Read-only is not low-risk when the read scope is *everything*. Compromising Sentinel yields applicant PII, customer data, agent tokens' existence and usage patterns, infrastructure topology, and a map of what is unmonitored. Read-only breach is still breach.

### 4. Alert fatigue (HIGH — the most likely real-world failure)
Security monitoring dies of noise far more often than of blindness. If Sentinel emits INFO/WATCH freely, Mason stops reading, and the one CRITICAL that mattered is buried on line 400. An attacker can accelerate this deliberately: generate benign-looking anomalies until the channel is worthless, then act.

### 5. Self-reported telemetry is forgeable (HIGH)
If Sentinel's picture comes from what agents write about themselves, a compromised agent simply writes reassuring entries. The recent `activity-recorder.mjs` disappearance is instructive: the control plane's picture of Cursor was clean while the underlying reality was broken.

### 6. Sentinel leaking what it is protecting (HIGH)
The natural implementation of "flag suspicious content" is to quote the content in the alert. That copies PII, résumé text, or a secret straight into alerts, AI-HANDOFF, git, and — eventually — an AI prompt. **The finding must never carry the payload.**

### 7. Log poisoning and evidence destruction (MEDIUM-HIGH)
An attacker who can append to the stream Sentinel reads can fabricate findings, bury real ones, or forge an "all clear." If Sentinel can rewrite its own history, a compromised Sentinel erases the evidence of its own compromise.

### 8. Overlap with Matter and the governor (MEDIUM)
Matter already enforces tier/role policy; the compute governor already blocks unapproved spend; the certification engine already detects data-integrity failures. If Sentinel re-implements these, we get **two systems disagreeing about the same fact** — and no clarity about which is authoritative. Duplicated security logic is worse than one.

### 9. Fail-closed as a self-inflicted outage (MEDIUM)
If "Sentinel down" halts operations, killing Sentinel becomes the cheapest way to stop the company. Conversely, silent fail-open means a killed Sentinel gives an attacker free rein. Neither pure option is acceptable.

### 10. Non-deterministic security decisions (MEDIUM)
If detection logic is a model, the same input can produce different verdicts on different days, and nobody can prove why an action was taken. Security decisions must be reproducible and explainable after the fact.

---

## PERMISSIONS TO REMOVE

Remove from the proposal, exactly:

1. **`disable narrowly preauthorized agent capability`** — injection-triggerable capability revocation. Sentinel *requests*; Matter disposes.
2. **`mark suspect data STALE/UNTRUSTED`** as an autonomous action — it looks harmless but can halt the certification engine and blank Command Center panels. Downgrade to `propose_stale` + alert.
3. **`pause one suspicious AI task`** without a rate limit and an auto-expiry — as written this is unbounded.
4. **Any read of secret VALUES.** Sentinel may know a secret *exists*, its age, and whether it rotated. Never the value.
5. **Any read of applicant or customer PII payloads** — résumé text, cover letters, phone/email, POR customer notes, payment data.
6. **Read access to full request/response bodies.** Metadata only: route, method, status, actor, timing, size.
7. **Any write outside its own namespace.** Not MASTER_STATE, not task records, not the compute ledger, not code.
8. **POR/SQL/network/firewall/deploy/credential-rotation/account-disable** — already excluded in the proposal; keep them excluded and make it structural, not policy.
9. **Shared credentials or process with Matter** — see separation below.
10. **Ability to modify its own detection policy or audit log.**

---

## SAFE AUTOMATIC ACTIONS

Genuinely safe because each is **reversible, bounded, and cannot stop business work**:

1. `log_finding` — structured, no payload
2. `gather_evidence` — read-only, pointer-based (path + line + hash, never content)
3. `deduplicate_and_rate_limit` its own alerts
4. `alert(severity)` — to Matter and, for CRITICAL+, out-of-band to Mason
5. `copy_artifact_to_quarantine` — **copy, never move or delete**; the original stays live
6. `stop_retries_on_one_task` — bounded, auto-expiring, never on POR replication
7. `pause_one_agent_task` — **max 1 concurrent pause, auto-expires in 30 minutes, never a task owned by replication or employee-facing auth**
8. `raise_heartbeat_alarm` on a silent worker
9. `propose_containment` — a request Matter must approve, which is how everything heavier gets done

Note what is absent: nothing that stops **employee login**, **POR replication**, or **all automation**.

---

## OWNER-ONLY ACTIONS — always Mason, no exceptions

Credential rotation · disabling any employee account · firewall or network change · any POR write or SQL mutation · production deployment · any spend or billing change · deleting anything · **global automation halt** · modifying Sentinel's own detection policy or tier map · granting Sentinel new permissions · clearing or truncating the audit chain.

The last three matter most: **a Sentinel that can widen its own scope is not a monitor, it is an administrator.**

---

## SENTINEL FAILURE MODE

**Split the default. Fail open for business, fail closed for privilege.**

| Sentinel state | Employees & Command Center | POR replication | Tier 0–2 agent work | Tier 3+ / privileged |
|---|---|---|---|---|
| Healthy | normal | normal | normal | normal gates |
| **Offline / silent** | **normal** | **normal** | **normal** | **HALTED** |
| **Compromised (suspected)** | **normal** | **normal** | normal | HALTED + owner alert |

Rationale: killing the monitor must not halt the company (that rewards the attack), but it must not silently unlock risky operations either.

**Sentinel's absence must itself be an alarm.** Matter monitors Sentinel's heartbeat, and a dead-man's switch escalates to Mason out-of-band if Sentinel is silent beyond a threshold. A monitor nobody notices is missing is not a monitor.

---

## MATTER / SENTINEL SEPARATION

**Separate. Different process, different credentials, different write namespaces, no shared token.**

Three reasons:

1. **Separation of duties.** Sentinel detects and *proposes*; Matter authorizes and *acts*. One compromise should not yield both the detector and the actuator.
2. **Mutual observation.** Matter watches Sentinel's heartbeat; Sentinel watches Matter's behaviour for approval-bypass attempts. Neither can quietly fail.
3. **Blast radius.** Matter already has tier-2 write authority over the control plane. Merging Sentinel's broad read with Matter's write authority creates a single component that can both see everything and change things.

The one coupling that must exist: **if Matter is compromised or unresponsive, Sentinel must still reach Mason directly**, on a path that does not traverse Matter.

---

## LOG / EVIDENCE MODEL

1. **Hash-chained append-only.** Each entry carries the SHA-256 of the previous entry. Any deletion or edit breaks the chain and is detectable by a verifier that does not trust Sentinel.
2. **Sentinel cannot rewrite.** Append-only file handle; no truncate, no rewrite, verified by Codex.
3. **Off-box replication to the SSD.** Local compromise must not erase the record. Reuse the existing verified additive backup — it is already checksum-verified and never uses destructive sync.
4. **Pointers, not payloads.** A finding references `path:line` plus a content hash. Never the matched text — quoting the injection *is* the injection.
5. **Independent chain verification.** Codex verifies the chain, because a log validated only by its author proves nothing.
6. **Severity budget.** A hard cap on WATCH/INFO per hour, with overflow aggregated into a single summary. Alert fatigue is a real failure mode, and rate limiting is a security control.

---

## REMOTE-WORK IMPACT

**LOW — if the above changes are made.**

None of the safe automatic actions can block employee login, Command Center access, or POR reads. The fail-open-for-business default means even a dead Sentinel leaves remote staff working normally.

**It becomes HIGH if the proposal is built as written**, because `mark data STALE` and `disable agent capability` can both degrade Command Center for every remote user — and both are reachable by an attacker who can type text into a customer note or a résumé.

---

## WHAT CODEX SHOULD INDEPENDENTLY CERTIFY

1. Sentinel cannot write outside its namespace — attempt it and prove refusal
2. Secret values never appear in findings, alerts, or the audit chain
3. Applicant/customer PII never enters a finding payload
4. **Injected instructions inside business data produce a finding but never an action**
5. The hash chain verifies, and a tampered entry is detected
6. Containment is rate-limited, auto-expiring, and reversible
7. Sentinel cannot pause replication or anything employee-facing
8. Sentinel offline → business continues, privileged actions halt
9. Sentinel cannot modify its own policy or tier map
10. No detection decision depends on a model's judgement (reproducibility)

---

## TOP 5 CHANGES BEFORE BUILD

1. **Make detection deterministic.** Pattern/threshold logic in code. A model may summarise a finding for Mason *after* the fact, and must never receive raw business text or decide whether to act.
2. **Sentinel proposes; Matter disposes.** Remove capability-disable and data-STALE from Sentinel's autonomous set. Keep only the reversible, bounded actions listed above.
3. **Metadata-only ingestion.** Sentinel sees signals — route, actor, timing, size, count, hash — never payloads. This kills the injection, PII-leak, and aggregation risks in one design decision.
4. **Hash-chained, off-box, Codex-verified audit.** Tamper-evidence that does not depend on trusting Sentinel.
5. **Split failure mode + dead-man's switch.** Fail open for business, closed for privilege, and make Sentinel's own silence an alarm.

---

## One thing the proposal gets right

Sentinel is explicitly barred from being the orchestrator, from POR, from deploys, from spend, and from approving its own changes. That restraint is the correct instinct and is more than most security-agent designs start with. The changes above extend the same logic to the places it has not yet reached — chiefly that **read scope is a permission too**, and that a containment action is a privileged operation even when it looks defensive.
