// VERIFIED STOP — "I sent a kill" is not evidence that spending stopped.
//
// The 2026-08-12 incident: the dispatcher was killed, reported stopped, and
// cursor-agent kept running and spending for ~2 more minutes. Then cleanup
// modified MASTER_STATE.json, which re-fired the trigger and started a third
// session. Both were reported as "stopped".
//
// A stop is STOP_CONFIRMED only when all four hold:
//   1. the target process is gone
//   2. no replacement worker appeared
//   3. the trigger that can respawn it is disarmed (when required)
//   4. usage events stopped increasing
// Anything else is STOP_UNVERIFIED.
import { execFileSync } from "node:child_process";
import { readLedger, activePaidRuns, now } from "./governor.mjs";
import { recordIncident } from "./accounting.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Count live processes whose command line matches a runtime pattern. */
export function countMatching(pattern) {
  try {
    const out = execFileSync("/bin/ps", ["ax", "-o", "pid=,command="], { encoding: "utf8" });
    return out.split("\n").filter((l) => l.includes(pattern) && !l.includes("ps ax")).length;
  } catch {
    return -1; // -1 = could not determine; never report 0 on failure
  }
}

export function launchdArmed(label) {
  try {
    execFileSync("launchctl", ["print", `gui/${process.getuid()}/${label}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify a stop actually stopped spending.
 *
 * @param {object} o
 * @param {number[]} o.pids            processes that were supposed to die
 * @param {string}   o.runtimePattern  command-line fragment of the paid runtime
 * @param {string[]} o.triggers        launchd labels that must be disarmed
 * @param {number}   o.settleMs        how long to watch before deciding
 */
export async function verifyStop({ pids = [], runtimePattern, triggers = [], settleMs = 6000 }) {
  const before = readLedger().length;
  const checks = [];

  // 1. targets gone
  const stillAlive = pids.filter(processAlive);
  checks.push({
    check: "target_processes_terminated",
    ok: stillAlive.length === 0,
    detail: stillAlive.length ? `still alive: ${stillAlive.join(", ")}` : "all terminated",
  });

  // 2. no replacement — sample twice across the settle window
  const first = runtimePattern ? countMatching(runtimePattern) : 0;
  await sleep(settleMs);
  const second = runtimePattern ? countMatching(runtimePattern) : 0;
  checks.push({
    check: "no_replacement_worker",
    ok: second <= 0 && first <= 0,
    detail: first < 0 || second < 0
      ? "could not enumerate processes — treated as UNVERIFIED"
      : `matching processes: ${first} then ${second}`,
  });

  // 3. respawn triggers disarmed
  const armed = triggers.filter(launchdArmed);
  checks.push({
    check: "respawn_triggers_disarmed",
    ok: armed.length === 0,
    detail: armed.length ? `still armed: ${armed.join(", ")}` : "none armed",
  });

  // 4. usage events stopped growing
  const after = readLedger().length;
  checks.push({
    check: "usage_events_stopped",
    ok: after === before,
    detail: after === before ? "no new usage events" : `${after - before} new usage event(s) during settle`,
  });

  const verified = checks.every((c) => c.ok);
  const result = {
    status: verified ? "STOP_CONFIRMED" : "STOP_UNVERIFIED",
    verified_at: now(),
    checks,
    still_alive: stillAlive,
  };

  if (!verified) {
    recordIncident({
      type: "STOP_UNVERIFIED", severity: "P0", occurred_at: result.verified_at,
      summary: `Stop could not be verified: ${checks.filter((c) => !c.ok).map((c) => c.check).join(", ")}`,
      measured: { checks }, cost_amount: null, status: "OPEN",
      evidence: ["AI-HANDOFF/governor/verified-stop.mjs"],
    });
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const pattern = (argv.find((a) => a.startsWith("--pattern=")) || "").split("=")[1] || "cursor-agent --use-system-ca";
  const triggers = ((argv.find((a) => a.startsWith("--triggers=")) || "").split("=")[1] || "")
    .split(",").filter(Boolean);
  const pids = activePaidRuns().map((r) => r.pid);
  const res = await verifyStop({ pids, runtimePattern: pattern, triggers, settleMs: 4000 });
  console.log(`${res.status}`);
  for (const c of res.checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.check} — ${c.detail}`);
  process.exit(res.status === "STOP_CONFIRMED" ? 0 : 1);
}
