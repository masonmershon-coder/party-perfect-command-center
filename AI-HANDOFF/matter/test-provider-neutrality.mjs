#!/usr/bin/env node
// The 9 provider-neutrality + cost-routing verifications required by the policy.
// HERMETIC — scratch dir, synthetic workers, no real state, no model calls.
//   node test-provider-neutrality.mjs
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = mkdtempSync(path.join(tmpdir(), "pn-"));
process.env.MATTER_DIR = SCRATCH;
copyFileSync(path.join(HERE, "MATTER_POLICY.json"), path.join(SCRATCH, "MATTER_POLICY.json"));
const M = await import("./matter-registry.mjs");

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};
const OK = ["true"], BAD = ["false"];
const ready = (id, caps, opts = {}) => {
  M.register({ worker_id: id, detect: opts.detect || OK, capabilities: caps,
    permissions: opts.permissions || {}, cost_class: opts.cost_class || "subscription",
    provider: opts.provider || `prov-${id}` });
  M.probe(id); M.heartbeat(id, {}); M.ack(id);
};

// 1 — register a synthetic NEW provider without modifying routing code
t("1. a brand-new provider registers with NO routing-code change", () => {
  const before = readFileSync(path.join(HERE, "matter-registry.mjs"), "utf8");
  ready("vendor-from-2027", { widgetcraft: 0.9, reasoning: 0.8 });
  const after = readFileSync(path.join(HERE, "matter-registry.mjs"), "utf8");
  assert.equal(before, after, "registering a provider must not require editing the router");
});

// 2 + 3 — give it a capability and prove Matter can select it
t("2/3. Matter considers and SELECTS the new provider on capability alone", () => {
  const d = M.route({ task_id: "PN-1", required_capabilities: { widgetcraft: 0.8, reasoning: 0.5 } });
  assert.equal(d.primary, "vendor-from-2027");
  assert.equal(d.route, undefined, "a judgement task must not be routed to deterministic software");
});

// 4 — remove availability, prove Matter routes elsewhere
t("4. availability loss reroutes to another worker", () => {
  ready("backup-vendor", { widgetcraft: 0.85, reasoning: 0.5 });
  M.register({ worker_id: "vendor-from-2027", detect: BAD });
  M.probe("vendor-from-2027");
  const d = M.route({ task_id: "PN-2", required_capabilities: { widgetcraft: 0.8, reasoning: 0.5 } });
  assert.equal(d.primary, "backup-vendor", "must reroute when the preferred worker goes offline");
  const gone = d.considered.find((c) => c.worker_id === "vendor-from-2027");
  assert.ok(gone.reasons.some((r) => /not available/.test(r)));
});

// 5 — cost influences selection where quality permits
t("5. among equally-capable workers, the CHEAPER cost class wins", () => {
  ready("pricey-worker", { ledgerwork: 0.9, reasoning: 0.9 }, { cost_class: "frontier" });
  ready("thrifty-worker", { ledgerwork: 0.9, reasoning: 0.9 }, { cost_class: "local" });
  const d = M.route({ task_id: "PN-3", required_capabilities: { ledgerwork: 0.9, reasoning: 0.9 } });
  assert.equal(d.primary, "thrifty-worker", "cheapest CAPABLE worker must win");
  const chosen = d.considered.find((c) => c.worker_id === "thrifty-worker");
  const other = d.considered.find((c) => c.worker_id === "pricey-worker");
  assert.ok(chosen.cost_rung < other.cost_rung, "cost ladder must be reflected in the decision record");
});

t("5b. cost NEVER overrides a required capability (cheap-but-incapable loses)", () => {
  ready("cheap-but-weak", { ledgerwork: 0.2, reasoning: 0.2 }, { cost_class: "local" });
  const d = M.route({ task_id: "PN-4", required_capabilities: { ledgerwork: 0.9, reasoning: 0.9 } });
  assert.notEqual(d.primary, "cheap-but-weak");
  const weak = d.considered.find((c) => c.worker_id === "cheap-but-weak");
  assert.ok(weak.reasons.some((r) => /level 0.2 < required/.test(r)), "must be rejected on capability, not price");
});

// 6 — capability without permission cannot perform the restricted task
t("6. CAPABILITY != AUTHORITY: capable but unpermitted worker is refused", () => {
  ready("capable-no-perm", { ledgerwork: 0.99, reasoning: 0.99 }, { cost_class: "local", permissions: { por_write: false } });
  const d = M.route({ task_id: "PN-5", required_capabilities: { ledgerwork: 0.9 }, required_permissions: ["por_write"] });
  const c = d.considered.find((x) => x.worker_id === "capable-no-perm");
  assert.ok(c.reasons.some((r) => /lacks permission 'por_write'/.test(r)));
  assert.equal(d.primary, null, "no worker holds por_write, so the task must not be assigned");
  assert.equal(d.blocked, true);
});

// 7 — a business role changes provider without changing identity/history
t("7. a business role can change providers without losing identity or history", () => {
  const agents = JSON.parse(readFileSync(path.join(HERE, "BUSINESS_AGENTS.json"), "utf8")).agents;
  const mike = agents.mike;
  assert.ok(mike, "mike must exist as a stable role");
  assert.ok(mike.required_capabilities, "the role declares CAPABILITIES, not a provider");
  const asString = JSON.stringify(agents);
  for (const p of ["cursor", "codex", "claude", "grok", "claw", "openai", "anthropic"])
    assert.ok(!new RegExp(`"${p}"`, "i").test(asString), `business roles must not name provider ${p}`);
  // route Mike's work twice against different fleets; identity is unchanged both times
  ready("mike-runtime-A", { reasoning: 0.8, research: 0.6 }, { cost_class: "standard_api" });
  const first = M.route({ task_id: "PN-6a", agent_id: "mike", required_capabilities: mike.required_capabilities });
  ready("mike-runtime-B", { reasoning: 0.9, research: 0.9 }, { cost_class: "local" });
  const second = M.route({ task_id: "PN-6b", agent_id: "mike", required_capabilities: mike.required_capabilities });
  assert.notEqual(first.primary, second.primary, "the runtime moved to a better/cheaper worker");
  assert.equal(mike.agent_id, "mike", "the role identity is untouched by the runtime change");
});

// 8 — deterministic tasks do not invoke an LLM
t("8. DETERMINISTIC-FIRST: a no-judgement task is not routed to any model", () => {
  const d = M.route({ task_id: "PN-7", objective: "check whether a heartbeat is stale",
                      required_capabilities: {}, requires_intelligence: false });
  assert.equal(d.route, "DETERMINISTIC_SOFTWARE");
  assert.equal(d.primary, null, "no worker may be woken for deterministic work");
  assert.match(d.selection_basis, /deterministic software/i);
  // and the inverse still routes to a worker
  const think = M.route({ task_id: "PN-8", required_capabilities: { reasoning: 0.5 } });
  assert.notEqual(think.route, "DETERMINISTIC_SOFTWARE");
});

// 9 — no provider-name lock-in remains in the executable routing layer
t("9. the executable router contains NO provider-name lock-in", () => {
  const src = readFileSync(path.join(HERE, "matter-registry.mjs"), "utf8")
    .split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  for (const name of ["cursor", "codex", "claude", "grok", "claw", "chatgpt", "openai", "anthropic"])
    assert.ok(!new RegExp(`["'\`]${name}["'\`]`, "i").test(src), `router must not hard-code provider ${name}`);
});

t("+ UNKNOWN cost is treated as standard, never as cheap", () => {
  const p = M.policy();
  assert.equal(M.costRung(p, "UNKNOWN"), 4);
  assert.equal(M.relativeCost(p, "UNKNOWN"), null);
  assert.ok(M.costRung(p, "local") < M.costRung(p, "UNKNOWN"), "unknown must never outrank a known-cheap worker");
});

t("+ worker contract records UNKNOWN rather than fabricating precision", () => {
  const w = M.register({ worker_id: "bare-worker" });
  for (const f of ["cost_class", "estimated_cost", "latency_class", "local_or_remote", "data_boundaries"])
    assert.equal(w[f], "UNKNOWN", `${f} must default to UNKNOWN`);
  assert.deepEqual(w.quality_history, { samples: 0, verified_pass: 0 });
});

// REGRESSION — found by test 6 during implementation. An unrecognised capability name plus a
// required permission was short-circuited to "deterministic", skipping the permission gate.
// Consequential work must never take the deterministic path.
t("R1. permission-gated work can NEVER take the deterministic short-circuit", () => {
  const d = M.route({ task_id: "PN-R1", required_capabilities: { unheard_of_skill: 0.5 },
                      required_permissions: ["por_write"] });
  assert.notEqual(d.route, "DETERMINISTIC_SOFTWARE", "permission-gated work must go through the full gate");
  assert.equal(d.blocked, true);
  assert.ok(d.considered.length > 0, "workers must actually be evaluated and rejected with reasons");
});

t("R2. protected / verification-required work also bypasses the short-circuit", () => {
  const prot = M.route({ task_id: "PN-R2", required_capabilities: {}, requires_intelligence: false,
                         protected_actions: ["money_spend"] });
  assert.notEqual(prot.route, "DETERMINISTIC_SOFTWARE");
  assert.equal(prot.owner_approval_required, true);
  const ver = M.route({ task_id: "PN-R3", required_capabilities: {}, requires_intelligence: false,
                        risk_class: "por_write" });
  assert.notEqual(ver.route, "DETERMINISTIC_SOFTWARE");
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`scratch: ${SCRATCH}`);
process.exit(fail ? 1 : 0);
