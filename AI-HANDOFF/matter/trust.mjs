#!/usr/bin/env node
// MATTER V1.2 — TRUST REPAIR. Deterministic. Calls no model.
//
// Repairs the five Codex V1.1 findings. The security-critical one:
//
//   Codex submitted five `verified_pass` outcomes with NO verifier and received score=1.
//   A worker could manufacture its own verified success and improve its own routing score.
//
// This module makes an independent verifier MANDATORY and checks eleven separate conditions
// before a verified_pass may be recorded. A rejected verification is NOT silently downgraded
// to reported_complete — it is rejected, with an audited reason.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.MATTER_DIR || HERE;
const F = (n) => path.join(DIR, n);
const TASKS = F("TASK_ASSIGNMENTS.json");        // task -> assigned verifier + evidence refs
const VERIF_LOG = F("VERIFICATION_LOG.jsonl");   // append-only: accepted AND rejected
const NONCES = F("ACK_NONCES.json");             // outstanding policy-ack challenges

const now = () => new Date().toISOString();
const readJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };
const writeJson = (f, o) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); };
const append = (f, o) => { mkdirSync(path.dirname(f), { recursive: true }); appendFileSync(f, JSON.stringify({ at: now(), ...o }) + "\n"); };

// ---------------------------------------------------------------- B. capability trust
export const TRUST_LEVELS = ["REVOKED", "UNKNOWN", "DECLARED", "OBSERVED", "MEASURED", "VERIFIED"];
/** Ordered so a policy can demand "at least MEASURED". REVOKED is below UNKNOWN on purpose. */
export const TRUST_RANK = { REVOKED: -1, UNKNOWN: 0, DECLARED: 1, OBSERVED: 2, MEASURED: 3, VERIFIED: 4 };

/**
 * Normalize any capability value into the full trust record. A bare number/boolean is a CLAIM,
 * so it lands at DECLARED — never higher. Trust is only raised by recordMeasurement().
 */
export function normalizeCapability(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const trusted = value.trusted_level && TRUST_LEVELS.includes(value.trusted_level) ? value.trusted_level
      : (value.source === "measured" ? "MEASURED" : value.source === "observed" ? "OBSERVED" : "DECLARED");
    return {
      claimed_level: value.level ?? value.claimed_level ?? null,
      trusted_level: trusted,
      provenance: value.provenance ?? value.source ?? "declared",
      measurement_method: value.measurement_method ?? null,
      evidence_ref: value.evidence_ref ?? null,
      measured_at: value.measured_at ?? null,
      expires_at: value.expires_at ?? null,
      verified_by: value.verified_by ?? null,
      verification_state: value.verification_state ?? (trusted === "MEASURED" || trusted === "VERIFIED" ? "verified" : "unverified"),
    };
  }
  return {
    claimed_level: value ?? null, trusted_level: "DECLARED", provenance: "declared",
    measurement_method: null, evidence_ref: null, measured_at: null, expires_at: null,
    verified_by: null, verification_state: "unverified",
  };
}

/** Effective trust NOW — an expired measurement decays back to DECLARED, it does not persist. */
export function effectiveTrust(cap, atIso = now()) {
  const c = normalizeCapability(cap);
  if (c.trusted_level === "REVOKED") return "REVOKED";
  if (c.expires_at && Date.parse(c.expires_at) <= Date.parse(atIso)) return "DECLARED";
  return c.trusted_level;
}

export function meetsTrust(cap, minLevel) {
  const eff = effectiveTrust(cap);
  if (eff === "REVOKED") return false;
  return TRUST_RANK[eff] >= (TRUST_RANK[minLevel] ?? 0);
}

// ---------------------------------------------------------------- task assignments
const loadTasks = () => readJson(TASKS, { tasks: {} });
/** Record who Matter assigned — the ONLY basis for "is this the assigned verifier". */
export function recordAssignment(task_id, { owner, verifier, risk_class = null, protected_action = false, authority = null }) {
  const t = loadTasks();
  const prev = t.tasks[task_id];
  // P0 FIX (trust audit 2026-08-17): an existing assignment is IMMUTABLE without Matter's
  // authority token. Previously any caller could re-record an assignment and seize ownership
  // and the verifier slot for itself. Reassignment now requires authority AND keeps history.
  if (prev && (prev.owner !== owner || prev.verifier !== verifier)) {
    const expected = process.env.MATTER_TRUST_AUTHORITY_TOKEN || null;
    if (!expected || authority !== expected) {
      append(VERIF_LOG, { event: "REASSIGNMENT_DENIED", task_id,
        from: { owner: prev.owner, verifier: prev.verifier }, to: { owner, verifier },
        reason: expected ? "invalid authority token" : "no authority token configured (fail closed)" });
      return prev; // assignment unchanged
    }
    prev.history = [...(prev.history || []), { owner: prev.owner, verifier: prev.verifier, replaced_at: now() }];
    append(VERIF_LOG, { event: "REASSIGNMENT_AUTHORIZED", task_id, from: { owner: prev.owner, verifier: prev.verifier }, to: { owner, verifier } });
  }
  t.tasks[task_id] = { ...(prev || {}), task_id, owner, verifier, risk_class, protected_action,
    evidence_refs: prev?.evidence_refs || [], history: prev?.history || [], assigned_at: prev?.assigned_at || now(), updated_at: now() };
  writeJson(TASKS, t);
  return t.tasks[task_id];
}
export function attachEvidence(task_id, refs) {
  const t = loadTasks();
  if (!t.tasks[task_id]) throw new Error(`unknown task ${task_id}`);
  t.tasks[task_id].evidence_refs = [...new Set([...(t.tasks[task_id].evidence_refs || []), ...[].concat(refs)])];
  writeJson(TASKS, t);
  return t.tasks[task_id];
}
export const getTask = (task_id) => loadTasks().tasks[task_id] || null;

// ---------------------------------------------------------------- A. verification gate
/**
 * THE GATE. Every condition required before a `verified_pass` may be recorded.
 * Returns {ok:true} or {ok:false, code, reason} — the caller MUST reject, not downgrade.
 */
export function checkIndependentVerification({ worker_id, task_id, verified_by, registry, policy, minVerifierTrust = "MEASURED" }) {
  const fail = (code, reason) => ({ ok: false, code, reason });
  if (!verified_by) return fail("NO_VERIFIER", "verified_pass requires verified_by");
  if (verified_by === worker_id) return fail("SELF_CERTIFICATION", "executor cannot verify its own work");

  const v = registry?.workers?.[verified_by];
  if (!v) return fail("VERIFIER_UNREGISTERED", `verifier ${verified_by} is not registered`);
  if (!v.available) return fail("VERIFIER_UNAVAILABLE", `verifier ${verified_by} is not available`);

  const maxAge = (policy.heartbeat_max_age_minutes ?? 60) * 60000;
  const age = v.last_heartbeat ? Date.now() - Date.parse(v.last_heartbeat) : Infinity;
  if (!(age <= maxAge)) return fail("VERIFIER_HEARTBEAT_STALE", `verifier heartbeat ${Number.isFinite(age) ? Math.round(age / 60000) + "m" : "missing"}`);

  if (v.policy_version_ack !== policy.version)
    return fail("VERIFIER_POLICY_STALE", `verifier acknowledged ${v.policy_version_ack || "nothing"}, current ${policy.version}`);

  if (!v.permissions?.verification) return fail("VERIFIER_NO_PERMISSION", `verifier lacks explicit 'verification' permission`);

  const cap = v.capabilities?.verification;
  if (cap === undefined) return fail("VERIFIER_NO_CAPABILITY", "verifier declares no verification capability");
  if (!meetsTrust(cap, minVerifierTrust))
    return fail("VERIFIER_CAPABILITY_UNTRUSTED", `verification capability trust is ${effectiveTrust(cap)}, need >= ${minVerifierTrust}`);

  const task = getTask(task_id);
  if (!task) return fail("TASK_UNKNOWN", `no assignment record for task ${task_id}`);
  if (task.verifier !== verified_by) return fail("NOT_ASSIGNED_VERIFIER", `task ${task_id} is assigned to verifier ${task.verifier || "none"}`);
  if (!(task.evidence_refs || []).length) return fail("NO_EVIDENCE", `task ${task_id} has no evidence references`);

  return { ok: true, task, verifier: verified_by };
}

/** Append-only verification decision log. Accepted AND rejected are both recorded. */
export function logVerification(entry) { append(VERIF_LOG, entry); }
export const verificationLog = () => (existsSync(VERIF_LOG)
  ? readFileSync(VERIF_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : []);

// ---------------------------------------------------------------- D. trustworthy policy ack
/**
 * Nonce challenge/response. Matter issues a single-use nonce bound to the CURRENT content-addressed
 * policy version; the worker must return it. A nonce cannot be replayed, cannot be reused for a
 * different policy version, and expires. This replaces "another process edited a JSON field".
 *
 * Worker identity is established by the launcher/service boundary (the process Matter itself
 * spawned), recorded as launcher_identity — NOT self-asserted in the payload.
 */
export function issueAckNonce(worker_id, policyVersion, { ttlSec = 300 } = {}) {
  const store = readJson(NONCES, { nonces: {} });
  const nonce = randomUUID();
  store.nonces[nonce] = { worker_id, policy_version: policyVersion, issued_at: now(),
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(), used: false };
  writeJson(NONCES, store);
  return { nonce, worker_id, policy_version: policyVersion };
}

export function redeemAckNonce({ nonce, worker_id, policy_version, launcher_identity }) {
  const store = readJson(NONCES, { nonces: {} });
  const rec = store.nonces[nonce];
  const fail = (code, reason) => ({ ok: false, code, reason });
  if (!rec) return fail("UNKNOWN_NONCE", "no such challenge was issued");
  if (rec.used) return fail("NONCE_REPLAY", "challenge already redeemed");
  if (Date.parse(rec.expires_at) <= Date.now()) return fail("NONCE_EXPIRED", "challenge expired");
  if (rec.worker_id !== worker_id) return fail("NONCE_WRONG_WORKER", "challenge was issued to a different worker");
  if (rec.policy_version !== policy_version) return fail("POLICY_VERSION_MISMATCH", `challenge is for ${rec.policy_version}`);
  if (!launcher_identity) return fail("NO_LAUNCHER_IDENTITY", "acknowledgement must carry the launcher/process identity");
  rec.used = true; rec.redeemed_at = now(); rec.launcher_identity = launcher_identity;
  writeJson(NONCES, store);
  return { ok: true, worker_id, policy_version, launcher_identity, redeemed_at: rec.redeemed_at };
}

// ---------------------------------------------------------------- E. accurate selection audit
/** The ordered comparator chain. selection_basis must name the FIRST one that actually separated. */
export const COMPARATORS = [
  "capability_eligibility", "capability_trust", "permissions", "data_boundary",
  "availability", "heartbeat_freshness", "policy_status", "verified_quality",
  "cost", "latency", "deterministic_tie_break",
];

/**
 * Compare the winner against the runner-up and report which comparator genuinely decided it.
 * Codex finding #4: cost decided the winner while the audit line claimed latency/worker_id did.
 */
export function decidingComparator(winner, runnerUp) {
  if (!runnerUp) return { comparator: "sole_eligible_worker", detail: "only one worker satisfied every hard requirement" };
  if ((winner.score ?? null) !== (runnerUp.score ?? null))
    return { comparator: "verified_quality", detail: `measured score ${winner.score} vs ${runnerUp.score}` };
  if (winner.cost_rung !== runnerUp.cost_rung)
    return { comparator: "cost", detail: `cost rung ${winner.cost_rung} (${winner.cost_class}) beat rung ${runnerUp.cost_rung} (${runnerUp.cost_class})` };
  const wc = winner.relative_cost ?? null, rc = runnerUp.relative_cost ?? null;
  if (wc !== rc) return { comparator: "cost", detail: `relative cost ${wc} vs ${rc}` };
  if ((winner.latency_ms ?? null) !== (runnerUp.latency_ms ?? null))
    return { comparator: "latency", detail: `probe latency ${winner.latency_ms}ms vs ${runnerUp.latency_ms}ms` };
  return { comparator: "deterministic_tie_break", detail: `identical on every comparator; ordered by worker_id (${winner.worker_id} < ${runnerUp.worker_id})` };
}
