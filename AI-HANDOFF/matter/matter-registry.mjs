#!/usr/bin/env node
// MATTER — provider-neutral worker registry, policy broadcast, and capability router.
// DETERMINISTIC. Calls no model. Additive: it does not modify control-plane.mjs or orchestrate.mjs.
//
// THE RULE THIS ENFORCES: Matter owns the jobs; providers are replaceable workers.
// Routing selects by CAPABILITY, never by provider name. There is deliberately no map from
// "cursor" to "coding" anywhere in this file — a worker earns work by declaring (and proving)
// a capability, so a new provider becomes eligible by registering, with no code change here.
//
//   node matter-registry.mjs policy                      show current policy + version
//   node matter-registry.mjs register '<json>'           register/update a worker record
//   node matter-registry.mjs heartbeat <id> '<json>'     capability heartbeat (probed)
//   node matter-registry.mjs ack <id>                    acknowledge current policy version
//   node matter-registry.mjs probe [id]                  run real availability probes
//   node matter-registry.mjs route '<task json>'         select primary + verifier, audited
//   node matter-registry.mjs report '<json>'             end-of-work report -> outcomes
//   node matter-registry.mjs board                       owner view (from real state only)
//
// Persistence (all real, all append-only where it is history):
//   MATTER_POLICY.json        policy + version (input)
//   WORKER_REGISTRY.json      current worker records (state)
//   POLICY_ACKS.jsonl         who acknowledged which policy version, when
//   ROUTING_DECISIONS.jsonl   every routing decision + the reasons it chose/rejected
//   WORKER_OUTCOMES.jsonl     real task outcomes, the only input to a worker score
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkIndependentVerification, logVerification, recordAssignment, getTask, normalizeCapability, effectiveTrust, meetsTrust, decidingComparator } from "./trust.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Overridable so tests / Kituwa Vercel /tmp copies can route without writing the repo.
function matterDir() {
  return process.env.MATTER_DIR || HERE;
}
const F = (n) => path.join(matterDir(), n);
const policyFile = () => path.join(process.env.MATTER_POLICY_DIR || matterDir(), "MATTER_POLICY.json");
const registryFile = () => F("WORKER_REGISTRY.json");
const acksFile = () => F("POLICY_ACKS.jsonl");
const routesFile = () => F("ROUTING_DECISIONS.jsonl");
const outcomesFile = () => F("WORKER_OUTCOMES.jsonl");

const now = () => new Date().toISOString();
const readJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };
const writeJson = (f, o) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); };
const append = (f, o) => { mkdirSync(path.dirname(f), { recursive: true }); appendFileSync(f, JSON.stringify({ at: now(), ...o }) + "\n"); };
const readLines = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

// ---- policy ------------------------------------------------------------
/** Version = semver + content hash, so an edited policy is a NEW version even at the same semver. */
export function policy() {
  const p = readJson(policyFile(), null);
  if (!p) throw new Error(`no policy at ${policyFile()}`);
  const hash = createHash("sha256").update(JSON.stringify(p)).digest("hex").slice(0, 12);
  return { ...p, version: `${p.semver}+${hash}` };
}

// ---- registry ----------------------------------------------------------
const loadRegistry = () => readJson(registryFile(), { workers: {}, updated_at: null });
const saveRegistry = (r) => { r.updated_at = now(); writeJson(registryFile(), r); };

/**
 * Capability record. Vendor-neutral on purpose: `provider`/`product`/`model` are free text and
 * nothing routes on them. Capabilities are a map of name -> {level, source}. `source` is the
 * honesty field: "declared" (the worker says so) vs "measured" (our own benchmark proved it).
 */
export function register(input) {
  if (!input?.worker_id) throw new Error("register requires worker_id");
  const reg = loadRegistry();
  const prev = reg.workers[input.worker_id] || {};
  const rec = {
    worker_id: input.worker_id,
    provider: input.provider ?? prev.provider ?? null,
    product: input.product ?? prev.product ?? null,
    model: input.model ?? prev.model ?? null,
    version: input.version ?? prev.version ?? null,
    detect: input.detect ?? prev.detect ?? null,           // real availability probe (argv array or string)
    capabilities: input.capabilities ?? prev.capabilities ?? {},
    // P0 FIX (trust-boundary audit 2026-08-17): permissions are NEVER accepted from the
    // registering party. A worker that registers itself with {por_write:true} previously kept
    // that permission and was SELECTED for a POR write. Permissions now come only from the
    // owner-controlled authority path (grantPermission), so a capability can never imply one.
    permissions: prev.permissions ?? {},
    // --- standard worker contract (policy: worker_contract_fields) ---
    // UNKNOWN is a real, recorded value. Never fabricate cost/latency/quality precision.
    cost_class: input.cost_class ?? prev.cost_class ?? "UNKNOWN",
    estimated_cost: input.estimated_cost ?? prev.estimated_cost ?? "UNKNOWN",
    latency_class: input.latency_class ?? prev.latency_class ?? "UNKNOWN",
    local_or_remote: input.local_or_remote ?? prev.local_or_remote ?? "UNKNOWN",
    data_boundaries: input.data_boundaries ?? prev.data_boundaries ?? "UNKNOWN",
    quality_history: prev.quality_history ?? { samples: 0, verified_pass: 0 },
    verification_history: prev.verification_history ?? { verified: 0, rejected: 0 },
    context_tokens: input.context_tokens ?? prev.context_tokens ?? null,
    limitations: input.limitations ?? prev.limitations ?? [],
    // operational state — only ever set by a real probe/heartbeat, never by register()
    available: prev.available ?? false,
    last_probe: prev.last_probe ?? null,
    last_heartbeat: prev.last_heartbeat ?? null,
    latency_ms: prev.latency_ms ?? null,
    policy_version_ack: prev.policy_version_ack ?? null,
    registered_at: prev.registered_at ?? now(),
    updated_at: now(),
  };
  reg.workers[rec.worker_id] = rec;
  saveRegistry(reg);
  // A self-grant ATTEMPT is not an error, but it is never honoured and always recorded.
  if (input.permissions && Object.keys(input.permissions).length)
    append(routesFile(), { kind: "PERMISSION_SELF_GRANT_ATTEMPT", worker_id: rec.worker_id,
      attempted: Object.keys(input.permissions), outcome: "IGNORED - permissions require Matter authority" });
  return rec;
}

/**
 * The ONLY way a permission is granted. Requires Matter's trust-authority token, which is held
 * by the owner-controlled control plane and is deliberately NOT inherited by worker processes.
 * Fails closed: absent/incorrect token => no grant, and the attempt is audited.
 */
export function grantPermission(worker_id, permission, value, { authority } = {}) {
  const expected = process.env.MATTER_TRUST_AUTHORITY_TOKEN || null;
  if (!expected || authority !== expected) {
    append(routesFile(), { kind: "PERMISSION_GRANT_DENIED", worker_id, permission, reason: expected ? "bad authority token" : "no authority token configured (fail closed)" });
    throw new Error("PERMISSION GRANT DENIED: valid Matter trust authority required");
  }
  const reg = loadRegistry(); const w = reg.workers[worker_id];
  if (!w) throw new Error(`unknown worker ${worker_id}`);
  w.permissions = { ...(w.permissions || {}), [permission]: !!value };
  saveRegistry(reg);
  append(routesFile(), { kind: "PERMISSION_GRANTED", worker_id, permission, value: !!value });
  return w.permissions;
}

/** Capability heartbeat: I am here, this is my version, these capabilities changed. */
export function heartbeat(worker_id, payload = {}) {
  const reg = loadRegistry();
  const w = reg.workers[worker_id];
  if (!w) throw new Error(`unknown worker ${worker_id} — register first`);
  const changes = [];
  if (payload.version && payload.version !== w.version) {
    changes.push({ field: "version", from: w.version, to: payload.version });
    w.version = payload.version;
  }
  for (const [cap, val] of Object.entries(payload.capabilities || {})) {
    const before = w.capabilities[cap];
    const after = typeof val === "object" ? val : { level: val, source: "declared" };
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ field: `capability.${cap}`, from: before ?? null, to: after });
      w.capabilities[cap] = after;
    }
  }
  if (payload.limitations) w.limitations = payload.limitations;
  w.last_heartbeat = now();
  w.updated_at = now();
  saveRegistry(reg);
  // A capability change is recorded but grants NO extra authority on its own (policy §3/§4).
  if (changes.length) append(routesFile(), { kind: "CAPABILITY_CHANGE_DETECTED", worker_id, changes, note: "recorded; routing weight unchanged until evidence supports it" });
  return { worker_id, changes };
}

/** Real availability probe. Availability is measured, never asserted. */
export function probe(worker_id) {
  const reg = loadRegistry();
  const ids = worker_id ? [worker_id] : Object.keys(reg.workers);
  const out = [];
  for (const id of ids) {
    const w = reg.workers[id];
    if (!w) continue;
    if (!w.detect) { w.available = false; w.last_probe = now(); out.push({ id, available: false, reason: "no detect probe configured" }); continue; }
    const argv = Array.isArray(w.detect) ? w.detect : String(w.detect).split(" ");
    const t0 = Date.now();
    let ok = false, reason = "";
    try {
      const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 20000 });
      ok = !r.error && r.status === 0;
      reason = ok ? "probe ok" : `probe failed (${r.error ? r.error.code : "exit " + r.status})`;
    } catch (e) { ok = false; reason = String(e.message).slice(0, 80); }
    w.available = ok;
    w.latency_ms = Date.now() - t0;
    w.last_probe = now();
    out.push({ id, available: ok, reason, latency_ms: w.latency_ms });
  }
  saveRegistry(reg);
  return out;
}

/** Policy acknowledgement — recorded only when a worker actually calls this. */
export function ack(worker_id, capability_state = null) {
  const reg = loadRegistry();
  const w = reg.workers[worker_id];
  if (!w) throw new Error(`unknown worker ${worker_id} — register first`);
  const p = policy();
  w.policy_version_ack = p.version;
  w.updated_at = now();
  saveRegistry(reg);
  append(acksFile(), {
    event: "POLICY_VERSION_RECEIVED", worker_id, policy_version: p.version,
    capability_state: capability_state || Object.keys(w.capabilities),
    acknowledged: true,
  });
  return { worker_id, policy_version: p.version };
}

// ---- learned performance (no fake precision) ---------------------------
/**
 * Score from REAL outcomes only. Below min_samples the score is null and the router says so,
 * rather than manufacturing a number from two data points.
 */
export function scoreFor(worker_id, task_category = null) {
  const p = policy();
  const rows = readLines(outcomesFile()).filter((r) => r.worker_id === worker_id && (!task_category || r.task_category === task_category));
  const n = rows.length;
  if (n < (p.min_samples_for_score ?? 5)) return { score: null, samples: n, reason: `insufficient samples (${n} < ${p.min_samples_for_score})` };
  const good = rows.filter((r) => r.outcome === "verified_pass").length;
  const bad = rows.filter((r) => ["failed", "rework", "rolled_back", "human_correction"].includes(r.outcome)).length;
  return { score: Number(((good - bad) / n).toFixed(3)), samples: n };
}

// ---- cost ladder (policy-driven; no provider names) ---------------------
/** Rung on the cost ladder. UNKNOWN is treated as STANDARD, never as cheap. */
export function costRung(policy, cost_class) {
  const table = policy.cost_classes || {};
  const entry = table[cost_class] || table.UNKNOWN;
  return entry?.rung ?? 4;
}
export function relativeCost(policy, cost_class) {
  const table = policy.cost_classes || {};
  const entry = table[cost_class] || table.UNKNOWN;
  return entry?.relative_cost ?? null;
}
/**
 * Deterministic-first gate. A task that declares no need for judgement/reasoning/generation
 * must NOT wake a model — the caller is told to run plain software instead. This is the rule
 * that stops an LLM being used for "is there new email" or "is a heartbeat stale".
 */
export function requiresIntelligence(task) {
  if (task.requires_intelligence === true) return true;
  const caps = Object.keys(task.required_capabilities || {});
  // A task that names ANY capability is not deterministic — an unrecognised capability name is
  // NOT evidence that plain software can do the work. Defaulting unknown names to "deterministic"
  // let a permission-gated task skip the eligibility checks entirely; treat unknown as thinking.
  if (caps.length > 0) return true;
  if (task.requires_intelligence === false) return false;
  return false;
}
/**
 * May the deterministic short-circuit be taken at all? Never for consequential work: anything
 * requiring a permission, a protected action, or independent verification must go through the
 * full eligibility gate so it can be BLOCKED rather than quietly declared "deterministic".
 */
export function deterministicShortCircuitAllowed(task, { needsVerification, isProtected }) {
  if ((task.required_permissions || []).length > 0) return false;
  if (isProtected) return false;
  if (needsVerification) return false;
  return true;
}

// ---- the router --------------------------------------------------------
/**
 * Select PRIMARY (+ VERIFIER when policy requires one) for a task, by capability.
 *
 * A worker is eligible only if it: declares every required capability at/above the required
 * level, holds every permission the task needs, passed a real probe, has a fresh heartbeat,
 * and (for protected/verification-required work) has acknowledged the CURRENT policy version.
 * Every rejection is recorded with its reason, so a routing decision can be audited later.
 */
export function route(task) {
  const p = policy();
  const reg = loadRegistry();
  const required = task.required_capabilities || {};
  const needsVerification = task.needs_verification ??
    (task.risk_class ? p.verification_required_for.includes(task.risk_class) : false);
  const isProtected = (task.protected_actions || []).some((a) => p.protected_actions.includes(a));
  const maxAgeMs = (p.heartbeat_max_age_minutes ?? 60) * 60000;

  // DETERMINISTIC-FIRST: if the task needs no judgement, refuse to select a model at all.
  // Returning early (rather than picking a cheap worker) is the point — plain software runs it.
  if (!requiresIntelligence(task) && deterministicShortCircuitAllowed(task, { needsVerification, isProtected })) {
    const decision = {
      kind: "ROUTING_DECISION", task_id: task.task_id || null, objective: task.objective || null,
      task_category: task.task_category || null, policy_version: p.version,
      required_capabilities: required, needs_verification: needsVerification, protected: isProtected,
      primary: null, verifier: null, blocked: false,
      route: "DETERMINISTIC_SOFTWARE",
      selection_basis: "task declares no need for judgement/reasoning/generation — deterministic software must handle it; no model invoked",
      owner_approval_required: isProtected, considered: [],
    };
    append(routesFile(), decision);
    return decision;
  }

  const considered = [];
  for (const w of Object.values(reg.workers)) {
    const reasons = [];
    // Sensitive/permissioned work demands MEASURED capability trust. A self-DECLARED capability
    // is a claim and must not qualify a worker for it (Codex finding #2).
    const sensitive = (task.required_permissions || []).length > 0 || isProtected || needsVerification;
    const minTrust = task.min_capability_trust || (sensitive ? (p.min_capability_trust_for_sensitive_work || "MEASURED") : "DECLARED");
    for (const [cap, need] of Object.entries(required)) {
      const have = w.capabilities?.[cap];
      const level = have && typeof have === "object" ? (have.level ?? have.claimed_level) : have;
      if (have !== undefined && !meetsTrust(have, minTrust))
        reasons.push(`'${cap}' trust ${effectiveTrust(have)} < required ${minTrust}`);
      if (have === undefined) reasons.push(`missing capability '${cap}'`);
      else if (typeof need === "number" && !(Number(level) >= need)) reasons.push(`'${cap}' level ${level} < required ${need}`);
      else if (need === true && (level === false || level == null)) reasons.push(`'${cap}' not supported`);
    }
    for (const perm of task.required_permissions || []) {
      if (!w.permissions?.[perm]) reasons.push(`lacks permission '${perm}'`);
    }
    if (!w.available) reasons.push("not available (probe failed or never probed)");
    const age = w.last_heartbeat ? Date.now() - Date.parse(w.last_heartbeat) : Infinity;
    if (!(age <= maxAgeMs)) reasons.push(w.last_heartbeat ? `heartbeat stale (${Math.round(age / 60000)}m)` : "no heartbeat");
    // Stale-policy gate: only bites for sensitive/verification-required work (policy §13).
    if ((isProtected || needsVerification) && w.policy_version_ack !== p.version)
      reasons.push(`policy not acknowledged (has ${w.policy_version_ack || "none"}, current ${p.version})`);

    const s = scoreFor(w.worker_id, task.task_category);
    considered.push({ worker_id: w.worker_id, eligible: reasons.length === 0, reasons, score: s.score, samples: s.samples,
      latency_ms: w.latency_ms, cost_class: w.cost_class, cost_rung: costRung(p, w.cost_class), relative_cost: relativeCost(p, w.cost_class) });
  }

  // Rank. ELIGIBILITY IS DECIDED FIRST (capability, permission, availability, policy) — cost only
  // ever breaks ties AMONG workers that already satisfy every hard requirement, so cheap can never
  // override safety or a required capability (policy: cheap_never_overrides_safety).
  //   1. proven quality score (nulls last — never invented)
  //   2. cheapest rung on the cost ladder (deterministic -> local -> low-cost -> standard -> frontier)
  //   3. lower relative cost within the rung
  //   4. lower measured latency
  //   5. worker_id, purely for deterministic ordering
  const eligible = considered.filter((c) => c.eligible).sort((a, b) => {
    if ((b.score ?? -Infinity) !== (a.score ?? -Infinity)) return (b.score ?? -Infinity) - (a.score ?? -Infinity);
    if (a.cost_rung !== b.cost_rung) return a.cost_rung - b.cost_rung;
    const ac = a.relative_cost ?? Infinity, bc = b.relative_cost ?? Infinity;
    if (ac !== bc) return ac - bc;
    if ((a.latency_ms ?? 1e9) !== (b.latency_ms ?? 1e9)) return (a.latency_ms ?? 1e9) - (b.latency_ms ?? 1e9);
    return a.worker_id < b.worker_id ? -1 : 1;
  });

  const primary = eligible[0] || null;
  // Say plainly WHY this worker won. With no proven scores the choice is a probe-latency
  // tie-break, not a judgement about quality — recording that keeps the audit honest.
  // Codex finding #4: the audit line must name the comparator that ACTUALLY separated the
  // winner from the runner-up, not a guess. decidingComparator() replays the real comparison.
  const runnerUp = eligible[1] || null;
  const decided = primary ? decidingComparator(primary, runnerUp) : { comparator: "none", detail: "no eligible worker" };
  const selection_basis = !primary ? "no eligible worker"
    : `${decided.comparator}: ${decided.detail} (${eligible.length} eligible)`;
  let verifier = null, verifierNote = null;
  if (needsVerification) {
    // builder != verifier, and the verifier must itself declare a verification capability.
    const vcands = considered.filter((c) => c.eligible === true && c.worker_id !== primary?.worker_id);
    const withVer = vcands.filter((c) => {
      const w = reg.workers[c.worker_id];
      const v = w.capabilities?.verification;
      return v !== undefined && (typeof v === "object" ? v.level : v);
    });
    // A verifier candidate need not meet the BUILD capabilities, so re-check the independent pool too.
    const pool = withVer.length ? withVer : Object.values(reg.workers).filter((w) => {
      if (w.worker_id === primary?.worker_id) return false;
      const v = w.capabilities?.verification;
      if (!(v !== undefined && (typeof v === "object" ? v.level : v))) return false;
      const age = w.last_heartbeat ? Date.now() - Date.parse(w.last_heartbeat) : Infinity;
      return w.available && age <= maxAgeMs && w.policy_version_ack === p.version;
    }).map((w) => ({ worker_id: w.worker_id, eligible: true, reasons: [], score: scoreFor(w.worker_id).score, latency_ms: w.latency_ms }));
    verifier = pool[0] || null;
    if (!verifier) verifierNote = "NO INDEPENDENT VERIFIER AVAILABLE — task must not be certified until one is";
  }

  const decision = {
    kind: "ROUTING_DECISION",
    task_id: task.task_id || null,
    objective: task.objective || null,
    task_category: task.task_category || null,
    policy_version: p.version,
    required_capabilities: required,
    needs_verification: needsVerification,
    protected: isProtected,
    primary: primary?.worker_id || null,
    selection_basis,
    verifier: verifier?.worker_id || null,
    verifier_note: verifierNote,
    blocked: !primary || (needsVerification && !verifier),
    owner_approval_required: isProtected,
    considered,
    comparator_chain: decided.comparator,
  };
  append(routesFile(), decision);
  // Persist the assignment: this is the ONLY basis for "is this the assigned verifier" later.
  if (decision.task_id && decision.primary)
    try { recordAssignment(decision.task_id, { owner: decision.primary, verifier: decision.verifier, risk_class: task.risk_class || null, protected_action: isProtected }); } catch {}
  return decision;
}

// ---- end-of-work report ------------------------------------------------
/** Durable completion report; the outcome is the ONLY thing that moves a worker's score. */
export function report(r) {
  if (!r?.worker_id || !r?.task_id) throw new Error("report requires worker_id and task_id");
  const VALID = ["verified_pass", "reported_complete", "failed", "rework", "rolled_back", "human_correction", "blocked"];
  if (!VALID.includes(r.outcome)) throw new Error(`outcome must be one of ${VALID.join("|")}`);

  // V1.2 TRUST REPAIR (Codex finding #1). A `verified_pass` is a claim about INDEPENDENT
  // verification, so it must survive the full gate. Codex previously submitted five
  // self-verified passes with no verifier and earned score=1. Rejection is explicit — the
  // outcome is NOT silently downgraded to reported_complete, because a silent downgrade would
  // hide a worker attempting to certify itself.
  if (r.outcome === "verified_pass") {
    const gate = checkIndependentVerification({
      worker_id: r.worker_id, task_id: r.task_id, verified_by: r.verified_by,
      registry: loadRegistry(), policy: policy(),
      minVerifierTrust: policy().min_verifier_capability_trust || "MEASURED",
    });
    logVerification({
      event: gate.ok ? "VERIFICATION_ACCEPTED" : "VERIFICATION_REJECTED",
      task_id: r.task_id, worker_id: r.worker_id, verified_by: r.verified_by || null,
      code: gate.code || null, reason: gate.reason || null,
    });
    if (!gate.ok) {
      const err = new Error(`VERIFICATION REJECTED [${gate.code}]: ${gate.reason}`);
      err.code = gate.code;
      throw err;
    }
  }

  // P0 FIX (trust audit 2026-08-17): an outcome must come from an AUTHORIZED reporter.
  // Previously any caller could submit five `failed` outcomes naming another worker and drive
  // that worker's reputation to -1. A worker may report only its OWN outcome; a verdict about
  // someone else's work may come only from that task's assigned verifier.
  {
    const task = getTask(r.task_id);
    const reporter = r.reported_by || r.worker_id;
    const selfReport = reporter === r.worker_id;
    const isAssignedVerifier = task && task.verifier === reporter;
    if (!selfReport && !isAssignedVerifier) {
      logVerification({ event: "OUTCOME_REJECTED", task_id: r.task_id, worker_id: r.worker_id,
        reported_by: reporter, code: "UNAUTHORIZED_REPORTER",
        reason: "outcome must be self-reported or submitted by the task's assigned verifier" });
      const err = new Error(`OUTCOME REJECTED [UNAUTHORIZED_REPORTER]: ${reporter} may not report outcomes for ${r.worker_id}`);
      err.code = "UNAUTHORIZED_REPORTER";
      throw err;
    }
    if (task && task.owner && task.owner !== r.worker_id) {
      logVerification({ event: "OUTCOME_REJECTED", task_id: r.task_id, worker_id: r.worker_id,
        code: "NOT_TASK_EXECUTOR", reason: `task ${r.task_id} executor is ${task.owner}` });
      const err = new Error(`OUTCOME REJECTED [NOT_TASK_EXECUTOR]: ${r.worker_id} is not the recorded executor`);
      err.code = "NOT_TASK_EXECUTOR";
      throw err;
    }
  }

  // "reported_complete" is a worker's own claim and deliberately does NOT count as success.
  append(outcomesFile(), {
    task_id: r.task_id, worker_id: r.worker_id, task_category: r.task_category || null,
    outcome: r.outcome, verified_by: r.verified_by || null,
    changed: r.changed || null, artifacts: r.artifacts || [], tests: r.tests || null,
    deployment_state: r.deployment_state || null, blockers: r.blockers || [],
    new_capabilities: r.new_capabilities || [], new_limitations: r.new_limitations || [],
    next_action: r.next_action || null, latency_ms: r.latency_ms ?? null,
  });
  return { recorded: true, task_id: r.task_id, outcome: r.outcome };
}

// ---- owner view (real state only) --------------------------------------
/** Machine-readable owner board — every field comes from persisted state or probes. */
export function snapshot() {
  const p = policy();
  const reg = loadRegistry();
  const maxAgeMs = (p.heartbeat_max_age_minutes ?? 60) * 60000;
  const routes = readLines(routesFile());
  const acks = readLines(acksFile());
  const outcomes = readLines(outcomesFile());
  const watch = readLines(F("CAPABILITY_WATCH.jsonl"));
  const workers = Object.values(reg.workers)
    .sort((a, b) => (a.worker_id < b.worker_id ? -1 : 1))
    .map((w) => {
      const age = w.last_heartbeat ? Date.now() - Date.parse(w.last_heartbeat) : null;
      const s = scoreFor(w.worker_id);
      return {
        worker_id: w.worker_id,
        provider: w.provider,
        product: w.product,
        model: w.model,
        version: w.version,
        available: Boolean(w.available),
        last_probe: w.last_probe,
        last_heartbeat: w.last_heartbeat,
        heartbeat_age_minutes: age == null ? null : Math.round(age / 60000),
        heartbeat_fresh: age != null && age <= maxAgeMs,
        latency_ms: w.latency_ms,
        policy_version_ack: w.policy_version_ack,
        policy_synced: w.policy_version_ack === p.version,
        score: s.score,
        score_samples: s.samples,
        score_reason: s.reason || null,
        capabilities: w.capabilities || {},
        permissions: w.permissions || {},
        limitations: w.limitations || [],
        cost_class: w.cost_class,
      };
    });
  const routing = routes.filter((r) => r.kind === "ROUTING_DECISION");
  return {
    generated_at: now(),
    policy: {
      policy_id: p.policy_id,
      version: p.version,
      semver: p.semver,
      principle: p.principle,
      effective: p.effective,
    },
    workers,
    counts: {
      workers_total: workers.length,
      workers_available: workers.filter((w) => w.available).length,
      workers_policy_synced: workers.filter((w) => w.policy_synced).length,
      workers_heartbeat_fresh: workers.filter((w) => w.heartbeat_fresh).length,
      policy_acks: acks.length,
      routing_decisions: routing.length,
      routing_blocked: routing.filter((r) => r.blocked).length,
      capability_changes: routes.filter((r) => r.kind === "CAPABILITY_CHANGE_DETECTED").length,
      outcomes: outcomes.length,
      capability_watch_events: watch.length,
      updates_available: watch.filter((w) => w.kind === "UPDATE_AVAILABLE" && !w.applied).length,
    },
    recent_routing: routing.slice(-10).reverse(),
    recent_acks: acks.slice(-10).reverse(),
    recent_outcomes: outcomes.slice(-10).reverse(),
    recent_watch: watch.slice(-10).reverse(),
    business_agents: readJson(F("BUSINESS_AGENTS.json"), { agents: {} }).agents,
  };
}

export function board() {
  const snap = snapshot();
  const lines = [];
  lines.push(`MATTER  policy ${snap.policy.version}   workers ${snap.counts.workers_total}`);
  lines.push("");
  lines.push("WORKER            PROVIDER      AVAIL  HEARTBEAT   POLICY  SCORE   CAPABILITIES");
  for (const w of snap.workers) {
    const caps = Object.entries(w.capabilities || {})
      .map(([k, v]) => `${k}:${typeof v === "object" ? v.level : v}${(typeof v === "object" && v.source === "measured") ? "*" : ""}`)
      .join(" ");
    lines.push(
      `${w.worker_id.padEnd(17)} ${String(w.provider || "-").padEnd(13)} ${(w.available ? "YES" : "NO ").padEnd(6)} ` +
      `${(w.heartbeat_fresh ? `${w.heartbeat_age_minutes}m` : (w.last_heartbeat ? "STALE" : "never")).padEnd(11)} ` +
      `${(w.policy_synced ? "ok" : "STALE").padEnd(7)} ` +
      `${(w.score === null ? `n/a(${w.score_samples})` : String(w.score)).padEnd(7)} ${caps}`);
  }
  lines.push("");
  lines.push(`ROUTING DECISIONS ${snap.counts.routing_decisions}   BLOCKED ${snap.counts.routing_blocked}   CAPABILITY CHANGES ${snap.counts.capability_changes}`);
  lines.push(`POLICY ACKS ${snap.counts.policy_acks}   OUTCOMES RECORDED ${snap.counts.outcomes}   UPDATES AVAILABLE ${snap.counts.updates_available}`);
  lines.push("* = capability measured by our own benchmark; unmarked = declared by the worker");
  return lines.join("\n");
}

// ---- CLI ---------------------------------------------------------------
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const [cmd, ...a] = process.argv.slice(2);
  try {
    if (cmd === "policy") { const p = policy(); console.log(`${p.policy_id}  version ${p.version}`); console.log(p.principle); }
    else if (cmd === "register") console.log(JSON.stringify(register(JSON.parse(a[0])), null, 2));
    else if (cmd === "heartbeat") console.log(JSON.stringify(heartbeat(a[0], a[1] ? JSON.parse(a[1]) : {}), null, 2));
    else if (cmd === "ack") console.log(JSON.stringify(ack(a[0]), null, 2));
    else if (cmd === "probe") for (const r of probe(a[0])) console.log(`${r.id.padEnd(17)} ${r.available ? "AVAILABLE" : "UNAVAILABLE"}  ${r.reason}${r.latency_ms != null ? ` (${r.latency_ms}ms)` : ""}`);
    else if (cmd === "route") console.log(JSON.stringify(route(JSON.parse(a[0])), null, 2));
    else if (cmd === "report") console.log(JSON.stringify(report(JSON.parse(a[0])), null, 2));
    else if (cmd === "board") console.log(board());
    else if (cmd === "snapshot") console.log(JSON.stringify(snapshot(), null, 2));
    else { console.log("usage: policy|register|heartbeat|ack|probe|route|report|board|snapshot"); process.exit(2); }
  } catch (e) { console.error("ERR:", e.message); process.exit(1); }
}
