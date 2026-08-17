#!/usr/bin/env node
// Tests for the Matter provider-neutral registry + router. HERMETIC: runs against a scratch
// MATTER_DIR, uses synthetic workers with real (harmless) probes, writes nothing to real state.
//   MATTER_DIR=$(mktemp -d) node test-matter-registry.mjs
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = process.env.MATTER_DIR || mkdtempSync(path.join(tmpdir(), "matter-test-"));
process.env.MATTER_DIR = SCRATCH;
copyFileSync(path.join(HERE, "MATTER_POLICY.json"), path.join(SCRATCH, "MATTER_POLICY.json"));

const M = await import("./matter-registry.mjs");

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};

// Probes that really run. `true` always succeeds, `false` always fails — real processes,
// so availability is genuinely measured rather than stubbed.
// V1.2: sensitive / verification-required work now requires MEASURED capability trust.
// A bare number is a DECLARED claim, so these fixtures were upgraded to measured records.
const measuredCap = (level) => ({ level, trusted_level: "MEASURED", provenance: "benchmark",
  measurement_method: "party-perfect harness", measured_at: new Date().toISOString() });
const OK_PROBE = ["true"];
const BAD_PROBE = ["false"];

const mkWorker = (id, caps, opts = {}) => M.register({
  worker_id: id, provider: opts.provider || `provider-${id}`, product: "test", version: "1",
  detect: opts.detect || OK_PROBE, capabilities: caps, permissions: opts.permissions || {},
  cost_class: opts.cost_class || "subscription",
});

t("1. policy version is content-addressed (edit => new version)", () => {
  const p = M.policy();
  assert.match(p.version, /^\d+\.\d+\.\d+\+[0-9a-f]{12}$/);
  assert.equal(M.policy().version, p.version, "version must be stable for identical content");
});

t("2. register creates a record but never asserts availability", () => {
  const w = mkWorker("alpha", { coding: 0.8 });
  assert.equal(w.available, false, "a fresh registration must NOT be considered available");
  assert.equal(w.last_probe, null);
});

t("3. availability is measured by a real probe", () => {
  mkWorker("goodprobe", { coding: 0.5 });
  mkWorker("badprobe", { coding: 0.5 }, { detect: BAD_PROBE });
  const res = Object.fromEntries(M.probe().map((r) => [r.id, r.available]));
  assert.equal(res.goodprobe, true);
  assert.equal(res.badprobe, false, "a failing probe must report UNAVAILABLE");
});

t("4. heartbeat records capability CHANGES without granting authority", () => {
  mkWorker("beta", { coding: 0.5 });
  const r = M.heartbeat("beta", { version: "2", capabilities: { coding: 0.9, browser: true } });
  const fields = r.changes.map((c) => c.field);
  assert.ok(fields.includes("version"));
  assert.ok(fields.includes("capability.coding"));
  assert.ok(fields.includes("capability.browser"));
});

t("5. policy ack is recorded only when a worker actually acks", () => {
  mkWorker("gamma", { coding: 0.5 });
  const before = M.board();
  assert.match(before, /gamma.*STALE/s, "unacked worker shows STALE policy");
  M.ack("gamma");
  assert.match(M.board(), /gamma(?!.*STALE)/);
});

t("6. ROUTING IS BY CAPABILITY, NOT PROVIDER NAME", () => {
  // A capability unique to this test, so ONLY these two workers can qualify and the
  // assertion cannot be satisfied (or broken) by workers left over from other tests.
  mkWorker("cursor-lookalike", { widgetwork: 0.2 });   // famous-sounding name, weak capability
  mkWorker("unknown-newcomer", { widgetwork: 0.95 });  // unknown name, strong capability
  M.probe(); M.heartbeat("cursor-lookalike", {}); M.heartbeat("unknown-newcomer", {});
  const d = M.route({ task_id: "T1", required_capabilities: { widgetwork: 0.9 } });
  assert.equal(d.primary, "unknown-newcomer", "must pick on capability, never on a familiar provider name");
  const rejected = d.considered.find((c) => c.worker_id === "cursor-lookalike");
  assert.ok(rejected.reasons.some((r) => /level 0.2 < required/.test(r)), "rejection must state the capability reason");
});

t("7. a brand-new provider becomes eligible with NO code change", () => {
  mkWorker("future-model-9", { coding: 0.99, research: 0.9 });
  M.probe("future-model-9"); M.heartbeat("future-model-9", {});
  const d = M.route({ task_id: "T2", required_capabilities: { coding: 0.99 } });
  assert.equal(d.primary, "future-model-9");
});

t("8. unavailable / stale-heartbeat workers are excluded with reasons", () => {
  mkWorker("offline-one", { coding: 0.99 }, { detect: BAD_PROBE });
  M.probe("offline-one"); M.heartbeat("offline-one", {});
  const d = M.route({ task_id: "T3", required_capabilities: { coding: 0.99 } });
  const c = d.considered.find((x) => x.worker_id === "offline-one");
  assert.equal(c.eligible, false);
  assert.ok(c.reasons.some((r) => /not available/.test(r)));
});

t("9. missing permission blocks selection", () => {
  mkWorker("no-perm", { deploy: 0.9 }, { permissions: { production_deploy: false } });
  M.probe("no-perm"); M.heartbeat("no-perm", {});
  const d = M.route({ task_id: "T4", required_capabilities: { deploy: 0.5 }, required_permissions: ["production_deploy"] });
  const c = d.considered.find((x) => x.worker_id === "no-perm");
  assert.ok(c.reasons.some((r) => /lacks permission/.test(r)));
});

t("10. builder != verifier for verification-required work", () => {
  mkWorker("builder-a", { coding: measuredCap(0.9) });
  mkWorker("checker-b", { coding: measuredCap(0.3), verification: measuredCap(0.9) }, { permissions: { verification: true } });
  M.probe(); M.heartbeat("builder-a", {}); M.heartbeat("checker-b", {});
  M.ack("builder-a"); M.ack("checker-b");
  const d = M.route({ task_id: "T5", required_capabilities: { coding: 0.9 }, risk_class: "production_deployment" });
  assert.equal(d.needs_verification, true);
  assert.ok(d.primary && d.verifier, "both roles must be filled");
  assert.notEqual(d.primary, d.verifier, "builder must never verify its own work");
});

// Test 11 needs a fleet containing exactly ONE worker, so it runs against its own scratch dir
// via a fresh module instance (the ?v= query defeats the ESM module cache).
const SCRATCH2 = mkdtempSync(path.join(tmpdir(), "matter-solo-"));
copyFileSync(path.join(HERE, "MATTER_POLICY.json"), path.join(SCRATCH2, "MATTER_POLICY.json"));
process.env.MATTER_DIR = SCRATCH2;
const M2 = await import("./matter-registry.mjs?solo=1");
process.env.MATTER_DIR = SCRATCH; // restore for the remaining tests

t("11. no independent verifier => task is BLOCKED, never auto-certified", () => {
  // The ONLY worker in this fleet can build and verify — but it may not verify itself.
  M2.register({ worker_id: "solo-worker", detect: OK_PROBE, capabilities: { coding: measuredCap(0.9), verification: measuredCap(0.9) }, permissions: { verification: true } });
  M2.probe("solo-worker"); M2.heartbeat("solo-worker", {}); M2.ack("solo-worker");
  const d = M2.route({ task_id: "T6", required_capabilities: { coding: 0.9 }, risk_class: "por_write" });
  assert.equal(d.primary, "solo-worker");
  assert.equal(d.verifier, null, "the sole worker must NOT be allowed to verify its own build");
  assert.equal(d.blocked, true, "with no independent verifier the task must be blocked");
  assert.match(d.verifier_note, /NO INDEPENDENT VERIFIER/);
});

t("12. protected action demands owner approval", () => {
  const d = M.route({ task_id: "T7", required_capabilities: { coding: 0.1 }, protected_actions: ["money_spend"] });
  assert.equal(d.owner_approval_required, true);
});

t("13. stale-policy worker is refused sensitive work", () => {
  mkWorker("unsynced", { coding: 0.99, verification: 0.9 });
  M.probe("unsynced"); M.heartbeat("unsynced", {});  // deliberately no ack
  const d = M.route({ task_id: "T8", required_capabilities: { coding: 0.99 }, risk_class: "security" });
  const c = d.considered.find((x) => x.worker_id === "unsynced");
  assert.ok(c.reasons.some((r) => /policy not acknowledged/.test(r)));
});

t("14. NO FAKE PRECISION: score stays null below the sample floor", () => {
  const s0 = M.scoreFor("alpha");
  assert.equal(s0.score, null);
  assert.match(s0.reason, /insufficient samples/);
  // V1.2 SECURITY CHANGE: this line previously submitted 5 verified_pass outcomes with NO
  // verifier — the exact self-certification exploit Codex demonstrated. It is now rejected.
  // The sample floor is therefore exercised with honest self-reported completions instead.
  for (let i = 0; i < 5; i++) M.report({ task_id: `S${i}`, worker_id: "alpha", outcome: "reported_complete" });
  const s1 = M.scoreFor("alpha");
  assert.equal(typeof s1.score, "number", "score appears only once real samples exist");
  assert.equal(s1.score, 0, "self-reported completions must not produce a POSITIVE score");
  assert.equal(s1.samples, 5);
});

t("15. a worker's own completion claim does NOT count as success", () => {
  mkWorker("claimer", { coding: 0.5 });
  for (let i = 0; i < 6; i++) M.report({ task_id: `C${i}`, worker_id: "claimer", outcome: "reported_complete" });
  const s = M.scoreFor("claimer");
  assert.equal(s.score, 0, "self-reported completion must not raise the score");
});

t("16. every routing decision is durably audited with reasons", () => {
  const f = path.join(SCRATCH, "ROUTING_DECISIONS.jsonl");
  assert.ok(existsSync(f));
  const rows = readFileSync(f, "utf8").trim().split("\n").map(JSON.parse);
  const d = rows.filter((r) => r.kind === "ROUTING_DECISION");
  assert.ok(d.length >= 5);
  assert.ok(d.every((r) => Array.isArray(r.considered)), "each decision records who was considered");
  assert.ok(d.every((r) => r.policy_version), "each decision records the policy version in force");
});

t("17. THE ANTI-PATTERN IS ABSENT: no provider name drives routing", () => {
  const src = readFileSync(path.join(HERE, "matter-registry.mjs"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  for (const name of ["cursor", "codex", "claude", "grok", "claw", "chatgpt", "openai"]) {
    const re = new RegExp(`["'\`]${name}["'\`]`, "i");
    assert.ok(!re.test(src), `router must not contain a hard-coded provider name (${name})`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`scratch: ${SCRATCH}`);
process.exit(fail ? 1 : 0);
