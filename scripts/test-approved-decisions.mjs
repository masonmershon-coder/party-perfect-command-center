#!/usr/bin/env node
// Decision-linked regression checks. Functional, not wording-based.
// Run before any production deploy: node scripts/test-approved-decisions.mjs [BASE_URL]
// Exit non-zero = an approved decision has regressed. See 07 - Business Admin/DECISIONS.md
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || process.env.SMOKE_BASE_URL || "https://partyperfect.app";
let pass = 0, fail = 0;
const ok = (d, n, c, x = "") => { c ? (console.log(`  PASS  [${d}] ${n}`), pass++) : (console.log(`  FAIL  [${d}] ${n} ${x}`), fail++); };

// ---- D-001/D-002: Quick Apply must be REJECTED (functional, not cosmetic) ----
async function checkJobs() {
  console.log("D-001/D-002 — full application enforced");
  // A Quick-Apply-shaped payload: the minimal legacy shape with the quick flag.
  const res = await fetch(`${BASE}/api/jobs/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      applyMode: "quick",
      roles: ["tents"],
      fullName: "REGRESSION TEST",
      phone: "9185550100",
      email: "test@example.invalid",
      city: "Tulsa",
    }),
  }).catch((e) => ({ error: e }));
  if (res.error) return ok("D-002", "jobs endpoint reachable", false, res.error.message);
  const body = await res.text().catch(() => "");
  // A bare 4xx is NOT proof: a build that still HAS Quick Apply also 4xx's on
  // unrelated validation ("Pick at least one role interest"). Require the
  // specific Quick-Apply rejection, or report INCONCLUSIVE rather than PASS.
  const specificallyRejected = /quick.?apply .*(no longer|not available)|complete the full application/i.test(body);
  const acceptedOutright = res.status >= 200 && res.status < 300;
  if (acceptedOutright) {
    ok("D-002", "Quick Apply payload is rejected", false, "(server ACCEPTED a Quick Apply submission)");
  } else if (specificallyRejected) {
    ok("D-002", "Quick Apply payload is rejected for the right reason", true);
  } else {
    console.log(`  INCONCLUSIVE  [D-002] rejected with an unrelated error (status ${res.status}) — cannot confirm D-002 from this probe`);
    fail++;
  }
}

// ---- D-006: deployed version must not be older than the approved one ----
async function checkVersion() {
  console.log("D-006 — deploy preserves approved work");
  const approved = readFileSync(new URL("../lib/app-version.ts", import.meta.url), "utf8")
    .match(/APP_VERSION = "([0-9.]+)"/)?.[1];
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health) return ok("D-006", "health endpoint reachable", false);
  const cmp = (a, b) => a.split(".").map(Number).reduce((acc, n, i) => acc || n - Number(b.split(".")[i] || 0), 0);
  ok("D-006", `live version >= approved (${health.version} vs ${approved})`, cmp(health.version, approved) >= 0);
  ok("D-004", "POR snapshot present and not stale", health.porSnapshotPresent && !health.porSnapshotStale,
     `(present=${health.porSnapshotPresent} stale=${health.porSnapshotStale})`);
}

// ---- D-004/D-005: POR numbers must look like POR, not fee-polluted ----
async function checkPorSanity() {
  console.log("D-004/D-005 — POR data sanity");
  const s = await fetch(`${BASE}/api/stats`).then((r) => r.json()).then((j) => j.stats?.por).catch(() => null);
  if (!s) return ok("D-004", "stats reachable", false);
  // POR owns ~9,840 catalog items. An "out" count in the hundreds of thousands
  // means fee/service SKUs are polluting the rentable count (the v1.9.0 fix).
  ok("D-005", "inventoryOut is a plausible rentable count (< 100k)", s.inventoryOut < 100000, `(got ${s.inventoryOut})`);
  ok("D-005", "inventoryAvailable is plausible (< 1M)", s.inventoryAvailable < 1000000, `(got ${s.inventoryAvailable})`);
}

console.log(`Approved-decision regression checks against ${BASE}\n`);
await checkJobs(); await checkVersion(); await checkPorSanity();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
