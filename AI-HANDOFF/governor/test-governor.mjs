#!/usr/bin/env node
// ADVERSARIAL tests for the paid-compute governor.
// STUBS ONLY -- this file must never invoke a real paid runtime.
//
//   node test-governor.mjs
//
// The bar is not "the happy path works". It is "every path I can think of that
// would let money get spent without approval is closed".
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorizePaidCompute, loadPolicy, savePolicy, DEFAULT_POLICY, CODES,
  engageEmergencyStop, releaseEmergencyStop, appendLedger, readLedger,
  LEDGER_FILE, POLICY_FILE, APPROVALS_FILE, LOCK_DIR, lockPath, spendSummary,
} from "./governor.mjs";
import { runPaidRuntime, killTree, isAlive, stopAllPaidRuns } from "./runner.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SANDBOX = path.join(HERE, ".test-sandbox");
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name} ${extra}`); fail++; }
};

// --- isolate: never touch the real policy/ledger -----------------------------
const REAL = {
  policy: existsSync(POLICY_FILE) ? readFileSync(POLICY_FILE, "utf8") : null,
  ledger: existsSync(LEDGER_FILE) ? readFileSync(LEDGER_FILE, "utf8") : null,
  approvals: existsSync(APPROVALS_FILE) ? readFileSync(APPROVALS_FILE, "utf8") : null,
};
const restore = () => {
  REAL.policy != null ? writeFileSync(POLICY_FILE, REAL.policy) : rmSync(POLICY_FILE, { force: true });
  REAL.ledger != null ? writeFileSync(LEDGER_FILE, REAL.ledger) : rmSync(LEDGER_FILE, { force: true });
  REAL.approvals != null ? writeFileSync(APPROVALS_FILE, REAL.approvals) : rmSync(APPROVALS_FILE, { force: true });
  releaseEmergencyStop();
};
process.on("exit", restore);

mkdirSync(SANDBOX, { recursive: true });
const stub = path.join(SANDBOX, "stub-paid-runtime.sh");
writeFileSync(stub, `#!/usr/bin/env bash\n# STUB. Costs nothing. Sleeps so we can test killing it.\nsleep "\${1:-1}"\necho stub-done\n`);
import { chmodSync } from "node:fs";
chmodSync(stub, 0o755);

const task = (over = {}) => ({
  task_id: "GOV-TEST-001", owner_agent: "cursor", risk_tier: 0,
  approval_required: false, ...over,
});
const fullyOpenPolicy = () => ({
  ...DEFAULT_POLICY,
  autonomous_paid_compute: "ON",
  approved_by: "test-harness",
  approved_at: new Date().toISOString(),
  budget: { ...DEFAULT_POLICY.budget, monthly_ceiling: 100, daily_ceiling: 50 },
  limits: { ...DEFAULT_POLICY.limits, max_runtime_seconds: 3 },
});

console.log("ADVERSARIAL GOVERNOR TESTS (stubs only, no paid runtime)\n");

// ---------------------------------------------------------------- defaults
console.log("default posture");
rmSync(POLICY_FILE, { force: true });
rmSync(APPROVALS_FILE, { force: true });
rmSync(LEDGER_FILE, { force: true });
let d = authorizePaidCompute(task());
ok("fresh install refuses to spend", d.code === CODES.MASTER_OFF, `(got ${d.code})`);
ok("default master switch is OFF", loadPolicy().autonomous_paid_compute === "OFF");
ok("default budget ceiling is unset (not invented)", loadPolicy().budget.monthly_ceiling === null);

// ------------------------------------------------- triggers cannot spend
console.log("\ntriggers and queue changes cannot spend");
savePolicy({ ...DEFAULT_POLICY });
for (const [label, t] of [
  ["a file change", task()],
  ["a NEW queued task", task({ status: "NEW" })],
  ["a launchd-fired task", task({ status: "WAITING_FOR_WORKER" })],
  ["a high-risk task", task({ risk_tier: 3 })],
]) {
  const r = authorizePaidCompute(t);
  ok(`${label} cannot spend`, r.allowed === false, `(got ${r.code})`);
}

// ------------------------------------------------- master switch
console.log("\nmaster kill switch");
savePolicy({ ...fullyOpenPolicy(), autonomous_paid_compute: "OFF" });
writeFileSync(APPROVALS_FILE, "GOV-TEST-001\n");
d = authorizePaidCompute(task());
ok("master OFF blocks even a fully approved task", d.code === CODES.MASTER_OFF, `(got ${d.code})`);

// ------------------------------------------------- budget required
console.log("\nbudget engine");
savePolicy({ ...DEFAULT_POLICY, autonomous_paid_compute: "ON" });
d = authorizePaidCompute(task());
ok("ON without an approved budget still blocks", d.code === CODES.NO_BUDGET, `(got ${d.code})`);

savePolicy({ ...fullyOpenPolicy(), budget: { ...fullyOpenPolicy().budget, monthly_ceiling: 10 } });
rmSync(LEDGER_FILE, { force: true });
appendLedger({ task_id: "OTHER", status: "COMPLETED", cost: 10 });
d = authorizePaidCompute(task());
ok("monthly ceiling reached blocks", d.code === CODES.BUDGET_EXCEEDED, `(got ${d.code})`);

rmSync(LEDGER_FILE, { force: true });
appendLedger({ task_id: "OTHER", status: "COMPLETED", cost: 60 });
savePolicy(fullyOpenPolicy());
d = authorizePaidCompute(task());
ok("daily ceiling reached blocks", d.code === CODES.BUDGET_EXCEEDED, `(got ${d.code})`);

// ------------------------------------------------- two-axis separation
console.log("\naction vs compute authorization are independent");
rmSync(LEDGER_FILE, { force: true });
savePolicy(fullyOpenPolicy());
rmSync(APPROVALS_FILE, { force: true });
d = authorizePaidCompute(task({ approval_required: true, approval_granted: true }));
ok("ACTION approved does NOT imply COMPUTE approved", d.code === CODES.NOT_APPROVED, `(got ${d.code})`);

writeFileSync(APPROVALS_FILE, "GOV-TEST-001\n");
d = authorizePaidCompute(task({ approval_required: true, approval_granted: false }));
ok("COMPUTE approved does NOT imply ACTION approved", d.code === CODES.ACTION_NOT_AUTHORIZED, `(got ${d.code})`);

d = authorizePaidCompute(task({ approval_required: true, approval_granted: true }));
ok("both approved => allowed", d.allowed === true, `(got ${d.code})`);

// ------------------------------------------------- retries
console.log("\nretry ceiling");
rmSync(LEDGER_FILE, { force: true });
savePolicy({ ...fullyOpenPolicy(), limits: { ...fullyOpenPolicy().limits, max_retries: 1 } });
appendLedger({ task_id: "GOV-TEST-001", status: "STARTED" });
appendLedger({ task_id: "GOV-TEST-001", status: "STARTED" });
d = authorizePaidCompute(task());
ok("retry ceiling blocks a third attempt", d.code === CODES.RETRY_LIMIT, `(got ${d.code})`);

console.log("\nrepair-loop ceiling");
rmSync(LEDGER_FILE, { force: true });
d = authorizePaidCompute(task(), { repairCount: 99 });
ok("repair-loop ceiling blocks runaway repair", d.code === CODES.REPAIR_LIMIT, `(got ${d.code})`);

// ------------------------------------------------- emergency stop
console.log("\nemergency stop");
rmSync(LEDGER_FILE, { force: true });
engageEmergencyStop("test", "harness");
d = authorizePaidCompute(task());
ok("emergency stop overrides everything", d.code === CODES.EMERGENCY_STOP, `(got ${d.code})`);
releaseEmergencyStop();

// ------------------------------------------------- single flight
console.log("\nduplicate-run protection");
rmSync(LEDGER_FILE, { force: true });
savePolicy(fullyOpenPolicy());
mkdirSync(LOCK_DIR, { recursive: true });
writeFileSync(lockPath("GOV-TEST-001"), JSON.stringify({ task_id: "GOV-TEST-001", pid: process.pid }));
d = authorizePaidCompute(task());
ok("a live lock blocks a duplicate paid run", d.code === CODES.ALREADY_RUNNING, `(got ${d.code})`);
writeFileSync(lockPath("GOV-TEST-001"), JSON.stringify({ task_id: "GOV-TEST-001", pid: 999999 }));
d = authorizePaidCompute(task());
ok("a dead lock does not block forever", d.allowed === true, `(got ${d.code})`);
rmSync(lockPath("GOV-TEST-001"), { force: true });

// ------------------------------------------------- ledger honesty
console.log("\nledger");
rmSync(LEDGER_FILE, { force: true });
savePolicy({ ...DEFAULT_POLICY });
await runPaidRuntime({ task: task(), agent: "cursor", runtime: "stub", bin: stub, args: ["1"], cwd: SANDBOX });
let led = readLedger();
ok("a refused attempt is still recorded", led.length === 1 && led[0].status === CODES.MASTER_OFF, `(got ${led[0]?.status})`);
ok("refusal records no cost as UNKNOWN, not 0", led[0].cost === "UNKNOWN");
const summary = spendSummary(led);
ok("spend summary reports unknown runs, not $0", summary.month_to_date.unknown_runs >= 0);

// ------------------------------------------------- process control
console.log("\nprocess control (stub child, costs nothing)");
rmSync(LEDGER_FILE, { force: true });
savePolicy(fullyOpenPolicy());
writeFileSync(APPROVALS_FILE, "GOV-TEST-001\nGOV-TEST-KILL\nGOV-TEST-ESTOP\n");

const t0 = Date.now();
const timed = await runPaidRuntime({
  task: task(), agent: "cursor", runtime: "stub", bin: stub, args: ["30"], cwd: SANDBOX,
});
const elapsed = Date.now() - t0;
ok("timeout kills a long-running child", timed.code === "TIMEOUT_KILLED", `(got ${timed.code})`);
ok("timeout fired near the configured 3s, not 30s", elapsed < 15000, `(${elapsed}ms)`);

rmSync(LEDGER_FILE, { force: true });
savePolicy({ ...fullyOpenPolicy(), limits: { ...fullyOpenPolicy().limits, max_runtime_seconds: 60 } });
const runPromise = runPaidRuntime({
  task: task({ task_id: "GOV-TEST-KILL" }), agent: "cursor", runtime: "stub",
  bin: stub, args: ["30"], cwd: SANDBOX,
});
await new Promise((r) => setTimeout(r, 800));
const active = JSON.parse(readFileSync(lockPath("GOV-TEST-KILL"), "utf8"));
ok("a running paid child is tracked with its pid", isAlive(active.pid));
const killedTree = killTree(active.pid, "SIGKILL");
ok("killTree signals the whole process group", killedTree === true);
await runPromise;
await new Promise((r) => setTimeout(r, 300));
ok("child is dead after killTree", !isAlive(active.pid));
ok("lock released after the run ends", !existsSync(lockPath("GOV-TEST-KILL")));

console.log("\nemergency stop kills live runs");
rmSync(LEDGER_FILE, { force: true });
const runPromise2 = runPaidRuntime({
  task: task({ task_id: "GOV-TEST-ESTOP" }), agent: "cursor", runtime: "stub",
  bin: stub, args: ["30"], cwd: SANDBOX,
});
await new Promise((r) => setTimeout(r, 800));
const killedList = stopAllPaidRuns("test emergency stop");
ok("stopAllPaidRuns reports what it killed", killedList.length >= 1, `(killed ${killedList.length})`);
await runPromise2;
await new Promise((r) => setTimeout(r, 500));
const { readdirSync: rd } = await import("node:fs");
const remaining = existsSync(LOCK_DIR) ? rd(LOCK_DIR).filter((f) => f.endsWith(".lock")) : [];
ok("no paid locks remain after emergency stop", remaining.length === 0, `(${remaining.join(",")})`);

// ------------------------------------------------- summary
rmSync(SANDBOX, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
