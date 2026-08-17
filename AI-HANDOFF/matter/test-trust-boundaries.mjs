#!/usr/bin/env node
// Permanent regressions for the four secondary trust boundaries audited 2026-08-17.
// Two P0 bypasses were CONFIRMED here and repaired; these tests keep them closed.
//   node test-trust-boundaries.mjs
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const S = mkdtempSync(path.join(tmpdir(), "tb-"));
process.env.MATTER_DIR = S;
delete process.env.MATTER_TRUST_AUTHORITY_TOKEN;   // fail-closed by default
copyFileSync(path.join(HERE, "MATTER_POLICY.json"), path.join(S, "MATTER_POLICY.json"));
const M = await import("./matter-registry.mjs");
const T = await import("./trust.mjs");
let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log(`  PASS  ${n}`); pass++; } catch (e) { console.log(`  FAIL  ${n}\n        ${String(e.message).split("\n")[0]}`); fail++; } };
const meas = (l) => ({ level: l, trusted_level: "MEASURED", provenance: "bench", measured_at: new Date().toISOString() });
const mk = (id, caps = { coding: meas(0.9) }, perms) => { M.register({ worker_id: id, detect: ["true"], capabilities: caps, permissions: perms }); M.probe(id); M.heartbeat(id, {}); M.ack(id); return id; };

t("A. P0 — worker CANNOT self-grant permissions at registration", () => {
  M.register({ worker_id: "selfgrant", detect: ["true"], capabilities: { por_ops: meas(0.9) },
    permissions: { por_write: true, deploy_production: true, spend_money: true } });
  const reg = JSON.parse(readFileSync(path.join(S, "WORKER_REGISTRY.json"), "utf8"));
  assert.deepEqual(reg.workers.selfgrant.permissions, {}, "self-granted permissions must be ignored");
});

t("A2. self-granted permission does not unblock a POR write", () => {
  M.probe("selfgrant"); M.heartbeat("selfgrant", {}); M.ack("selfgrant");
  const d = M.route({ task_id: "TBA", required_capabilities: { por_ops: 0.5 },
    required_permissions: ["por_write"], risk_class: "por_write", protected_actions: ["por_authoritative_write"] });
  assert.equal(d.primary, null, "POR write must remain BLOCKED");
  assert.equal(d.blocked, true);
});

t("A3. the self-grant ATTEMPT is audited", () => {
  const log = readFileSync(path.join(S, "ROUTING_DECISIONS.jsonl"), "utf8");
  assert.match(log, /PERMISSION_SELF_GRANT_ATTEMPT/);
});

t("A4. grantPermission fails CLOSED without Matter authority", () => {
  assert.throws(() => M.grantPermission("selfgrant", "por_write", true, { authority: "guess" }), /PERMISSION GRANT DENIED/);
  assert.throws(() => M.grantPermission("selfgrant", "por_write", true), /PERMISSION GRANT DENIED/);
});

t("B. P0 — an ordinary worker CANNOT seize task ownership or the verifier slot", () => {
  T.recordAssignment("TBB", { owner: "owner-a", verifier: "verifier-x" });
  T.recordAssignment("TBB", { owner: "thief", verifier: "thief" });   // unauthorized attempt
  const task = T.getTask("TBB");
  assert.equal(task.owner, "owner-a", "ownership must be immutable without authority");
  assert.equal(task.verifier, "verifier-x", "verifier slot must be immutable without authority");
});

t("B2. the reassignment attempt is audited", () => {
  assert.ok(T.verificationLog().some((e) => e.event === "REASSIGNMENT_DENIED"), "denial must be logged");
});

t("C. authority token is NOT present in an ordinary worker environment", () => {
  assert.equal(process.env.MATTER_TRUST_AUTHORITY_TOKEN, undefined);
  const src = readFileSync(path.join(HERE, "matter-registry.mjs"), "utf8");
  assert.match(src, /fail closed/, "grant path must document fail-closed behaviour");
});

t("D. P0 — an UNRELATED worker cannot poison another worker's score", () => {
  mk("victim"); mk("legit-verifier"); mk("attacker-d");
  T.recordAssignment("TBD", { owner: "victim", verifier: "legit-verifier" });
  T.attachEvidence("TBD", ["EVIDENCE/x.md"]);
  for (let i = 0; i < 5; i++)
    assert.throws(() => M.report({ task_id: "TBD", worker_id: "victim", outcome: "failed", reported_by: "attacker-d" }),
      /UNAUTHORIZED_REPORTER/);
  assert.equal(M.scoreFor("victim").samples, 0, "no poisoned samples may land");
});

t("D2. a worker cannot claim outcomes for a task it does not execute", () => {
  assert.throws(() => M.report({ task_id: "TBD", worker_id: "attacker-d", outcome: "reported_complete" }), /NOT_TASK_EXECUTOR/);
});

t("D3. the ASSIGNED verifier retains authority to reject work", () => {
  const r = M.report({ task_id: "TBD", worker_id: "victim", outcome: "failed", reported_by: "legit-verifier" });
  assert.equal(r.recorded, true, "legitimate verifier authority must be preserved");
});

t("E. shadow router executes nothing", () => {
  const src = readFileSync(path.join(HERE, "shadow-router.mjs"), "utf8");
  assert.ok(!/spawnSync|execFileSync|exec\(/.test(src), "shadow router must contain no execution primitive");
  assert.match(src, /legacy_is_executor: true/);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
