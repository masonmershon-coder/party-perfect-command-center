#!/usr/bin/env node
// Adversarial tests for AI cost accounting. SYNTHETIC DATA ONLY.
// No provider is contacted; no paid runtime is invoked.
//
//   node test-accounting.mjs
//
// The headline invariant under test: UNKNOWN must never render as $0.
import { sumRows, aggregate, groupBy, makeUsageEvent, COST_CLASS, periodKeys, detectWaste, fixedSummary, DEFAULT_FIXED } from "./accounting.mjs";

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? (console.log(`  PASS  ${n}`), pass++) : (console.log(`  FAIL  ${n} ${x}`), fail++); };

const run = (over = {}) => ({
  timestamp: "2026-08-13T12:00:00.000Z", status: "COMPLETED", provider: "cursor",
  agent: "cursor", task_id: "T1", project: "command-center", cost_amount: null, ...over,
});

console.log("AI COST ACCOUNTING — ADVERSARIAL TESTS (synthetic only)\n");

// ---------------------------------------------------- UNKNOWN is not zero
console.log("UNKNOWN vs $0");
ok("no runs at all renders $0.00 (verified zero)", sumRows([]).display === "$0.00");
ok("one unknown-cost run never renders $0",
   sumRows([run()]).display === "UNKNOWN (1 run)", `(got ${sumRows([run()]).display})`);
ok("three unknown runs render UNKNOWN, not $0",
   sumRows([run(), run(), run()]).display === "UNKNOWN (3 runs)");
const mixed = sumRows([run({ cost_amount: 2.5 }), run()]);
ok("mixed known+unknown shows both", mixed.display === "$2.50 + 1 UNKNOWN", `(got ${mixed.display})`);
ok("a verified zero-cost run is $0.00, not UNKNOWN",
   sumRows([run({ cost_amount: 0 })]).display === "$0.00");
ok("unknown runs are counted separately", sumRows([run(), run({ cost_amount: 1 })]).unknown_runs === 1);

// ---------------------------------------------------- classification
console.log("\ncost classification");
ok("a cost with no provenance is downgraded to ESTIMATED",
   makeUsageEvent({ cost_amount: 5 }).cost_classification === COST_CLASS.ESTIMATED);
ok("no cost => UNKNOWN classification",
   makeUsageEvent({}).cost_classification === COST_CLASS.UNKNOWN);
ok("explicit ACTUAL survives",
   makeUsageEvent({ cost_amount: 5, cost_classification: COST_CLASS.ACTUAL }).cost_classification === COST_CLASS.ACTUAL);
ok("token fields default to null, not 0", makeUsageEvent({}).total_tokens === null);
ok("model defaults to UNKNOWN, not a guess", makeUsageEvent({}).model === "UNKNOWN");

// ---------------------------------------------------- secrets
console.log("\nsecret hygiene");
let threw = false;
try { makeUsageEvent({ result: "key sk-abcdefghijklmnop1234" }); } catch { threw = true; }
ok("a usage event containing a secret is rejected", threw);

// ---------------------------------------------------- boundaries
console.log("\nday / month boundaries");
const at = new Date("2026-08-13T12:00:00");
const led = [
  run({ timestamp: "2026-08-13T00:00:01", cost_amount: 1 }),   // today
  run({ timestamp: "2026-08-12T23:59:59", cost_amount: 2 }),   // yesterday
  run({ timestamp: "2026-07-31T23:59:59", cost_amount: 4 }),   // last month
];
const a = aggregate(led, at);
ok("today excludes yesterday's 23:59", a.today.known_total === 1, `(got ${a.today.known_total})`);
ok("month excludes last month", a.month.known_total === 3, `(got ${a.month.known_total})`);
ok("period keys expose the timezone used", typeof periodKeys(at).tz === "string");

// ---------------------------------------------------- projection honesty
console.log("\nprojection");
const noKnown = aggregate([run(), run()], at);
ok("projection is null when nothing has a known cost", noKnown.projected_month.value === null);
ok("projection confidence is 'none' with no known cost", noKnown.projected_month.confidence === "none");
const someKnown = aggregate([run({ cost_amount: 10 }), run()], at);
ok("projection with unknowns present is low confidence", someKnown.projected_month.confidence === "low");
ok("projection basis states unknowns were excluded",
   /excluded as UNKNOWN/.test(someKnown.projected_month.basis));

// ---------------------------------------------------- status filtering
console.log("\nwhat counts as spend");
const withBlocked = [run(), run({ status: "BLOCKED_PAID_COMPUTE" })];
ok("a blocked attempt is not counted as spend", aggregate(withBlocked, at).month.runs === 1);
ok("a FAILED run IS counted as spend (money was still burned)",
   aggregate([run({ status: "FAILED", cost_amount: 3 })], at).month.known_total === 3);
ok("a TIMEOUT_KILLED run IS counted as spend",
   aggregate([run({ status: "TIMEOUT_KILLED", cost_amount: 1 })], at).month.known_total === 1);

// ---------------------------------------------------- attribution
console.log("\nattribution");
const byProject = groupBy([run({ project: "por-bridge", cost_amount: 5 }), run({ project: "matter" })], "project");
ok("project attribution splits correctly", byProject["por-bridge"].known_total === 5);
ok("a project with only unknown runs shows UNKNOWN",
   byProject["matter"].display === "UNKNOWN (1 run)");
const unattributed = groupBy([run({ project: null })], "project");
ok("missing project is 'unattributed', not silently dropped", Boolean(unattributed.unattributed));

// ---------------------------------------------------- fixed subscriptions
console.log("\nfixed subscriptions");
const fx = fixedSummary(DEFAULT_FIXED);
ok("known fixed monthly matches owner-reported baseline",
   Math.abs(fx.known_monthly - 244.83) < 0.02, `(got ${fx.known_monthly})`);
ok("Cursor is flagged as price-not-established, not $0",
   fx.unknown_price_subscriptions.includes("Cursor"));
ok("fixed costs are marked owner-reported, not provider-verified",
   fx.verified_against_provider === false);
ok("yearly subscriptions are amortized, not counted as monthly",
   fx.known_monthly < 25 + 100 + 20 + 99 + 10);

// ---------------------------------------------------- waste
console.log("\nwaste detection");
const wasteLed = [
  run({ task_id: "W1", retry_number: 1 }), run({ task_id: "W1", retry_number: 2 }),
  run({ task_id: "W2", status: "FAILED" }),
  run({ task_id: null }),
  run({ task_id: "W3", agent: "cursor" }), run({ task_id: "W3", agent: "cursor" }),   // same agent twice, unmarked = duplicate
  run({ task_id: "W4", agent: "cursor" }), run({ task_id: "W4", agent: "codex" }),     // implement + verify = NOT waste
];
const w = detectWaste(wasteLed);
const types = w.map((x) => x.type);
ok("retry loops are detected", types.includes("RETRY_LOOP"));
ok("spend on failed runs is detected", types.includes("FAILED_RUN_SPEND"));
ok("untracked (no TASK_ID) spend is detected", types.includes("UNTRACKED_SPEND"));
ok("same agent running one task twice unmarked is duplicate work", types.includes("DUPLICATE_WORK"));
ok("cursor-implements + codex-verifies is NOT flagged as duplicate",
   !w.some((x) => x.type === "DUPLICATE_WORK" && x.task_id === "W4"));
ok("every waste finding cites evidence rows", w.every((x) => typeof x.evidence_rows === "number"));
ok("waste never invents a dollar saving it cannot compute",
   w.filter((x) => x.avoidable_cost !== "UNKNOWN").every((x) => /^\$|UNKNOWN/.test(x.avoidable_cost)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
