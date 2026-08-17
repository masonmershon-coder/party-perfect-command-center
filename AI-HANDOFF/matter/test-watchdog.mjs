#!/usr/bin/env node
// Tests for the watchdog's safety-critical behaviour. HERMETIC — scratch dir, no real actions.
//   node test-watchdog.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRATCH = mkdtempSync(path.join(tmpdir(), "matter-wd-"));
process.env.MATTER_WATCHDOG_DIR = SCRATCH;
delete process.env.MATTER_WATCHDOG_ARMED;

const W = await import("./watchdog.mjs");

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};
const isoMinutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

t("1. UNARMED by default — arming must be deliberate", () => {
  assert.equal(W.isArmed(), false);
});

t("2. health classification covers all four states", () => {
  assert.equal(W.healthFor(isoMinutesAgo(5)).health, "HEALTHY");
  assert.equal(W.healthFor(isoMinutesAgo(90)).health, "STALE");
  assert.equal(W.healthFor(isoMinutesAgo(600)).health, "OFFLINE");
  assert.equal(W.healthFor(isoMinutesAgo(5), { degraded: true }).health, "DEGRADED");
});

t("3. a MISSING heartbeat is OFFLINE, never assumed healthy", () => {
  const h = W.healthFor(null);
  assert.equal(h.health, "OFFLINE");
  assert.match(h.reason, /no heartbeat ever/);
  // this is the exact failure the audit found: 2-5 day stale heartbeats sitting unnoticed
  const stale = W.healthFor(isoMinutesAgo(3400));
  assert.equal(stale.health, "OFFLINE");
});

t("4. act() performs NOTHING while unarmed", () => {
  const fakeReport = {
    armed: false,
    actions: [{ service: "matter-scheduler", action: "RESTART", command: ["/bin/echo", "should-not-run"] },
              { action: "RECLAIM_EXPIRED_LEASES", count: 3 }],
  };
  const r = W.act(fakeReport);
  assert.deepEqual(r.executed, [], "unarmed must execute nothing");
  assert.match(r.note, /UNARMED/);
  assert.equal(existsSync(path.join(SCRATCH, "INCIDENTS.jsonl")), false, "unarmed must not even write incidents");
});

t("5. observation still reports the actions it WOULD take", () => {
  const r = W.observe();
  assert.equal(r.armed, false);
  assert.ok(Array.isArray(r.actions), "pending actions are surfaced for the owner");
  assert.ok(r.actions.every((a) => a.executed === false), "every action is marked not-executed");
  assert.ok(["HEALTHY", "DEGRADED", "DOWN"].includes(r.matter_status));
});

t("6. flap detection stops restart loops", () => {
  const incidents = path.join(SCRATCH, "INCIDENTS.jsonl");
  const rows = [];
  for (let i = 0; i < 3; i++)
    rows.push(JSON.stringify({ at: isoMinutesAgo(5), service: "flappy", action: "RESTART_ATTEMPTED" }));
  writeFileSync(incidents, rows.join("\n") + "\n");
  const f = W.isFlapping("flappy");
  assert.equal(f.flapping, true, "3 restarts in the window must count as flapping");
  assert.equal(W.isFlapping("calm").flapping, false);
});

t("7. old restarts outside the window do NOT count as flapping", () => {
  const incidents = path.join(SCRATCH, "INCIDENTS.jsonl");
  const rows = [];
  for (let i = 0; i < 5; i++)
    rows.push(JSON.stringify({ at: isoMinutesAgo(600), service: "oldflap", action: "RESTART_ATTEMPTED" }));
  writeFileSync(incidents, rows.join("\n") + "\n");
  assert.equal(W.isFlapping("oldflap").flapping, false, "stale incidents must age out of the window");
});

t("8. arming is possible ONLY via explicit env/file (never inferred)", () => {
  process.env.MATTER_WATCHDOG_ARMED = "1";
  assert.equal(W.isArmed(), true, "explicit env arms it");
  delete process.env.MATTER_WATCHDOG_ARMED;
  assert.equal(W.isArmed(), false, "removing it disarms again");
});

t("9. the abandoned-task invariant is treated as CRITICAL", () => {
  // observe() escalates any abandoned task to CRITICAL — assert the mapping exists in source,
  // since producing a genuinely abandoned task would require corrupting real queue state.
  const src = readFileSync(new URL("./watchdog.mjs", import.meta.url), "utf8");
  assert.match(src, /level:\s*"CRITICAL"[\s\S]{0,120}ABANDONED TASKS/,
    "an abandoned task must raise a CRITICAL alert");
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`scratch: ${SCRATCH}`);
process.exit(fail ? 1 : 0);
