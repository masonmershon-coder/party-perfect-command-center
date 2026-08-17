#!/usr/bin/env node
// MATTER V1.2 — adversarial trust tests. HERMETIC. No model calls, no real state.
//   node test-trust-v12.mjs
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = mkdtempSync(path.join(tmpdir(), "v12-"));
process.env.MATTER_DIR = SCRATCH;
copyFileSync(path.join(HERE, "MATTER_POLICY.json"), path.join(SCRATCH, "MATTER_POLICY.json"));
const M = await import("./matter-registry.mjs");
const T = await import("./trust.mjs");

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};
const OK = ["true"], BAD = ["false"];
const measured = (level) => ({ level, trusted_level: "MEASURED", provenance: "benchmark",
  measurement_method: "party-perfect harness", evidence_ref: "EVIDENCE/bench.md", measured_at: new Date().toISOString() });

/** A fully trustworthy verifier: registered, available, fresh, acked, permitted, MEASURED. */
const goodVerifier = (id = "verifier-good") => {
  M.register({ worker_id: id, detect: OK, capabilities: { verification: measured(0.9) },
    permissions: { verification: true }, cost_class: "local" });
  M.probe(id); M.heartbeat(id, {}); M.ack(id);
  return id;
};
const worker = (id, caps = { coding: measured(0.9) }, opts = {}) => {
  M.register({ worker_id: id, detect: opts.detect || OK, capabilities: caps,
    permissions: opts.permissions || {}, cost_class: opts.cost_class || "local" });
  M.probe(id); if (opts.noHeartbeat !== true) M.heartbeat(id, {}); if (opts.noAck !== true) M.ack(id);
  return id;
};
const setupTask = (task_id, owner, verifier, { evidence = ["EVIDENCE/x.md"] } = {}) => {
  T.recordAssignment(task_id, { owner, verifier });
  if (evidence) T.attachEvidence(task_id, evidence);
};
const expectReject = (fn, code) => {
  try { fn(); throw new Error("EXPECTED REJECTION but the outcome was accepted"); }
  catch (e) {
    if (/EXPECTED REJECTION/.test(e.message)) throw e;
    assert.match(e.message, /VERIFICATION REJECTED/, `wrong error: ${e.message}`);
    if (code) assert.match(e.message, new RegExp(code), `expected code ${code}, got: ${e.message}`);
  }
};

// ---- 1-9: independent verification enforcement ----
t("1. worker self-submits verified_pass → REJECTED (the Codex exploit)", () => {
  const w = worker("w1"); const v = goodVerifier(); setupTask("K1", w, v);
  expectReject(() => M.report({ task_id: "K1", worker_id: w, outcome: "verified_pass" }), "NO_VERIFIER");
  assert.equal(M.scoreFor(w).samples, 0, "a rejected verification must not become a sample");
});

t("2. verified_by missing → REJECTED", () => {
  const w = worker("w2"); const v = goodVerifier(); setupTask("K2", w, v);
  expectReject(() => M.report({ task_id: "K2", worker_id: w, outcome: "verified_pass", verified_by: null }), "NO_VERIFIER");
});

t("3. verified_by equals executor → REJECTED", () => {
  const w = worker("w3"); const v = goodVerifier(); setupTask("K3", w, v);
  expectReject(() => M.report({ task_id: "K3", worker_id: w, outcome: "verified_pass", verified_by: w }), "SELF_CERTIFICATION");
});

t("4. verifier unregistered → REJECTED", () => {
  const w = worker("w4"); setupTask("K4", w, "ghost-verifier");
  expectReject(() => M.report({ task_id: "K4", worker_id: w, outcome: "verified_pass", verified_by: "ghost-verifier" }), "VERIFIER_UNREGISTERED");
});

t("5. verifier unavailable → REJECTED", () => {
  const w = worker("w5");
  const v = "verifier-offline";
  M.register({ worker_id: v, detect: BAD, capabilities: { verification: measured(0.9) }, permissions: { verification: true } });
  M.probe(v); M.heartbeat(v, {}); M.ack(v);
  setupTask("K5", w, v);
  expectReject(() => M.report({ task_id: "K5", worker_id: w, outcome: "verified_pass", verified_by: v }), "VERIFIER_UNAVAILABLE");
});

t("6. verifier heartbeat stale → REJECTED", () => {
  const w = worker("w6");
  const v = "verifier-stale";
  M.register({ worker_id: v, detect: OK, capabilities: { verification: measured(0.9) }, permissions: { verification: true } });
  M.probe(v); M.ack(v);  // deliberately never heartbeats
  setupTask("K6", w, v);
  expectReject(() => M.report({ task_id: "K6", worker_id: w, outcome: "verified_pass", verified_by: v }), "VERIFIER_HEARTBEAT_STALE");
});

t("7. verifier lacks explicit verification permission → REJECTED", () => {
  const w = worker("w7");
  const v = worker("verifier-noperm", { verification: measured(0.9) }, { permissions: {} });
  setupTask("K7", w, v);
  expectReject(() => M.report({ task_id: "K7", worker_id: w, outcome: "verified_pass", verified_by: v }), "VERIFIER_NO_PERMISSION");
});

t("8. verifier capability DECLARED but not MEASURED → REJECTED", () => {
  const w = worker("w8");
  const v = worker("verifier-declared", { verification: 0.9 }, { permissions: { verification: true } });
  setupTask("K8", w, v);
  expectReject(() => M.report({ task_id: "K8", worker_id: w, outcome: "verified_pass", verified_by: v }), "VERIFIER_CAPABILITY_UNTRUSTED");
});

t("9. task unknown / no evidence → REJECTED", () => {
  const w = worker("w9"); const v = goodVerifier();
  expectReject(() => M.report({ task_id: "NEVER-ASSIGNED", worker_id: w, outcome: "verified_pass", verified_by: v }), "TASK_UNKNOWN");
  T.recordAssignment("K9", { owner: w, verifier: v });   // assigned but NO evidence attached
  expectReject(() => M.report({ task_id: "K9", worker_id: w, outcome: "verified_pass", verified_by: v }), "NO_EVIDENCE");
});

t("9b. verifier is not the ASSIGNED verifier → REJECTED", () => {
  const w = worker("w9b"); const assigned = goodVerifier("verifier-assigned");
  const other = worker("verifier-other", { verification: measured(0.9) }, { permissions: { verification: true } });
  setupTask("K9B", w, assigned);
  expectReject(() => M.report({ task_id: "K9B", worker_id: w, outcome: "verified_pass", verified_by: other }), "NOT_ASSIGNED_VERIFIER");
});

t("9c. a FULLY VALID independent verification is ACCEPTED", () => {
  const w = worker("w9c"); const v = goodVerifier("verifier-valid");
  setupTask("K9C", w, v);
  const res = M.report({ task_id: "K9C", worker_id: w, outcome: "verified_pass", verified_by: v });
  assert.equal(res.recorded, true);
  assert.equal(M.scoreFor(w).samples, 1, "a valid verification does count");
});

t("+ every rejection is append-only audited", () => {
  const log = T.verificationLog();
  assert.ok(log.length >= 9, "rejections must be logged");
  assert.ok(log.some((e) => e.event === "VERIFICATION_REJECTED"));
  assert.ok(log.some((e) => e.event === "VERIFICATION_ACCEPTED"));
  assert.ok(log.every((e) => e.at), "each entry timestamped");
});

// ---- 10-13: capability trust ----
t("10. DECLARED capability cannot qualify for sensitive (permissioned) work", () => {
  const w = worker("declared-worker", { por_ops: 0.99 }, { permissions: { por_write: true } });
  const d = M.route({ task_id: "C10", required_capabilities: { por_ops: 0.9 }, required_permissions: ["por_write"] });
  const c = d.considered.find((x) => x.worker_id === "declared-worker");
  assert.ok(c.reasons.some((r) => /trust DECLARED < required MEASURED/.test(r)), `expected trust rejection, got ${JSON.stringify(c.reasons)}`);
});

t("11. REVOKED capability is never eligible", () => {
  const w = worker("revoked-worker", { coding: { level: 0.99, trusted_level: "REVOKED" } });
  const d = M.route({ task_id: "C11", required_capabilities: { coding: 0.5 } });
  const c = d.considered.find((x) => x.worker_id === "revoked-worker");
  assert.ok(!c.eligible, "revoked capability must not be eligible");
});

t("12. EXPIRED measurement decays to DECLARED", () => {
  const expired = { level: 0.9, trusted_level: "MEASURED", measured_at: "2020-01-01T00:00:00Z", expires_at: "2020-02-01T00:00:00Z" };
  assert.equal(T.effectiveTrust(expired), "DECLARED", "an expired measurement must not stay trusted");
  assert.equal(T.meetsTrust(expired, "MEASURED"), false);
});

t("13. capability can never grant permission", () => {
  const w = worker("capable-nopermission", { por_ops: measured(0.99) }, { permissions: {} });
  const d = M.route({ task_id: "C13", required_capabilities: { por_ops: 0.9 }, required_permissions: ["por_write"] });
  const c = d.considered.find((x) => x.worker_id === "capable-nopermission");
  assert.ok(c.reasons.some((r) => /lacks permission 'por_write'/.test(r)));
  assert.equal(d.primary, null);
});

// ---- 18-19: policy acknowledgement ----
t("18. stale policy acknowledgement blocks sensitive work", () => {
  const w = worker("unsynced-worker", { coding: measured(0.9) }, { noAck: true });
  const d = M.route({ task_id: "C18", required_capabilities: { coding: 0.5 }, risk_class: "security" });
  const c = d.considered.find((x) => x.worker_id === "unsynced-worker");
  assert.ok(c.reasons.some((r) => /policy not acknowledged/.test(r)));
});

t("19. ack nonce cannot be replayed or reused across policy versions", () => {
  const p = M.policy();
  const { nonce } = T.issueAckNonce("nonce-worker", p.version);
  const first = T.redeemAckNonce({ nonce, worker_id: "nonce-worker", policy_version: p.version, launcher_identity: "launchd:test" });
  assert.equal(first.ok, true, "first redemption succeeds");
  const replay = T.redeemAckNonce({ nonce, worker_id: "nonce-worker", policy_version: p.version, launcher_identity: "launchd:test" });
  assert.equal(replay.ok, false); assert.equal(replay.code, "NONCE_REPLAY");
  const { nonce: n2 } = T.issueAckNonce("nonce-worker", p.version);
  const wrongVersion = T.redeemAckNonce({ nonce: n2, worker_id: "nonce-worker", policy_version: "9.9.9+deadbeef", launcher_identity: "launchd:test" });
  assert.equal(wrongVersion.code, "POLICY_VERSION_MISMATCH");
  const { nonce: n3 } = T.issueAckNonce("nonce-worker", p.version);
  const wrongWorker = T.redeemAckNonce({ nonce: n3, worker_id: "someone-else", policy_version: p.version, launcher_identity: "launchd:test" });
  assert.equal(wrongWorker.code, "NONCE_WRONG_WORKER");
  const { nonce: n4 } = T.issueAckNonce("nonce-worker", p.version);
  const noIdentity = T.redeemAckNonce({ nonce: n4, worker_id: "nonce-worker", policy_version: p.version });
  assert.equal(noIdentity.code, "NO_LAUNCHER_IDENTITY");
});

// ---- 29: selection audit accuracy ----
t("29. selection_basis names the comparator that ACTUALLY decided", () => {
  worker("cost-cheap", { widget: measured(0.9) }, { cost_class: "local" });
  worker("cost-dear", { widget: measured(0.9) }, { cost_class: "frontier" });
  const d = M.route({ task_id: "C29", required_capabilities: { widget: 0.9 } });
  assert.equal(d.primary, "cost-cheap");
  assert.match(d.selection_basis, /^cost:/, `cost decided it, so the audit must say cost — got: ${d.selection_basis}`);
  assert.equal(d.comparator_chain, "cost");
});

t("29b. a sole eligible worker is described as such, not as a tie-break", () => {
  worker("only-one", { unique_skill: measured(0.9) });
  const d = M.route({ task_id: "C29B", required_capabilities: { unique_skill: 0.9 } });
  assert.equal(d.primary, "only-one");
  assert.match(d.selection_basis, /sole_eligible_worker/);
});

// ---- 27-28: deterministic-first ----
t("27. deterministic task wakes no AI", () => {
  const d = M.route({ task_id: "C27", required_capabilities: {}, requires_intelligence: false });
  assert.equal(d.route, "DETERMINISTIC_SOFTWARE");
  assert.equal(d.primary, null);
});

t("28. unknown capability is NOT treated as deterministic", () => {
  const d = M.route({ task_id: "C28", required_capabilities: { never_heard_of_this: 0.5 } });
  assert.notEqual(d.route, "DETERMINISTIC_SOFTWARE");
});

// ---- 26: protected actions ----
t("26. protected action remains approval-gated", () => {
  const d = M.route({ task_id: "C26", required_capabilities: { coding: 0.1 }, protected_actions: ["money_spend"] });
  assert.equal(d.owner_approval_required, true);
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`scratch: ${SCRATCH}`);
process.exit(fail ? 1 : 0);
