#!/usr/bin/env node
// Owner CLI + dashboard for the paid-compute governor. Deterministic; no LLM.
//
//   node cli.mjs status          the board
//   node cli.mjs stop "reason"   EMERGENCY STOP: kill live paid runs + block new
//   node cli.mjs resume          release the emergency stop (does NOT turn on)
//   node cli.mjs on --by=mason --monthly=50 [--daily=10]   arm paid autonomy
//   node cli.mjs off             disarm paid autonomy (budget kept)
//   node cli.mjs approve <TASK>  grant COMPUTE approval for one task
//   node cli.mjs ledger [n]      recent compute ledger rows
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import {
  loadPolicy, savePolicy, masterSwitchOn, budgetApproved, spendSummary,
  readLedger, activePaidRuns, emergencyStopEngaged, engageEmergencyStop,
  releaseEmergencyStop, APPROVALS_FILE, computeApprovedIds, now,
} from "./governor.mjs";
import { stopAllPaidRuns } from "./runner.mjs";

const money = (n) => (typeof n === "number" ? `$${n.toFixed(2)}` : "UNKNOWN");

/** Never print $0 when the truth is "we cannot measure it". */
function spendLine(bucket) {
  if (bucket.known_runs === 0 && bucket.unknown_runs === 0) return "$0.00 (no runs)";
  if (bucket.known_runs === 0) return `UNKNOWN (${bucket.unknown_runs} run(s), no cost data)`;
  const suffix = bucket.unknown_runs ? ` + ${bucket.unknown_runs} UNKNOWN` : "";
  return `${money(bucket.total)}${suffix}`;
}

function status() {
  const p = loadPolicy();
  const ledger = readLedger();
  const spend = spendSummary(ledger);
  const active = activePaidRuns();
  const blocked = ledger.filter((r) => String(r.status).startsWith("BLOCKED_"));
  const lastRun = [...ledger].reverse().find((r) => r.status === "COMPLETED" || r.status === "STARTED");
  const estop = emergencyStopEngaged();
  const b = p.budget || {};
  const remaining =
    typeof b.monthly_ceiling === "number" && spend.month_to_date.known_runs >= 0
      ? b.monthly_ceiling - spend.month_to_date.total
      : null;

  const lines = [
    "==================== PAID AI COMPUTE ====================",
    `AUTONOMOUS PAID COMPUTE:   ${masterSwitchOn(p) ? "ON" : "OFF"}`,
    `EMERGENCY STOP:            ${estop ? "ENGAGED" : "clear"}`,
    "",
    `TODAY'S VARIABLE AI USAGE: ${spendLine(spend.today)}`,
    `MONTH-TO-DATE VARIABLE:    ${spendLine(spend.month_to_date)}`,
    `MONTHLY BUDGET:            ${b.monthly_ceiling == null ? "NOT SET" : money(b.monthly_ceiling)}`,
    `BUDGET REMAINING:          ${remaining == null ? "UNKNOWN" : money(remaining)}`,
    "",
    `ACTIVE PAID AGENTS:        ${active.length}`,
    `BLOCKED PAID ATTEMPTS:     ${blocked.length}`,
    `LAST PAID RUN:             ${lastRun ? `${lastRun.at} (${lastRun.task_id})` : "never"}`,
    "",
    "-- fixed subscriptions (NOT autonomous compute) --",
    `  effective monthly: ${money(p.fixed_monthly_baseline?.effective_monthly)}  ·  yearly: ${money(p.fixed_monthly_baseline?.effective_yearly)}`,
    "=========================================================",
  ];
  if (active.length) {
    lines.push("", "live paid runs:");
    for (const a of active) lines.push(`  ${a.task_id}  pid ${a.pid}  ${a.runtime}  since ${a.started_at}`);
  }
  if (!masterSwitchOn(p) || !budgetApproved(p)) {
    lines.push(
      "",
      "DISARMED: no autonomous dispatcher can invoke a paid runtime.",
      !budgetApproved(p) ? "  reason: no owner-approved budget with a monthly ceiling" : "  reason: master switch OFF",
    );
  }
  console.log(lines.join("\n"));
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n) => (rest.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1];

switch (cmd) {
  case undefined:
  case "status":
    status();
    break;

  case "stop": {
    const reason = rest.filter((a) => !a.startsWith("--")).join(" ") || "manual emergency stop";
    engageEmergencyStop(reason, flag("by") || "owner");
    const killed = stopAllPaidRuns(reason);
    console.log(`EMERGENCY STOP engaged. Killed ${killed.length} live paid run(s).`);
    for (const k of killed) console.log(`  ${k.task_id} (pid ${k.pid})`);
    console.log("New paid compute is blocked until `resume`.");
    break;
  }

  case "resume":
    releaseEmergencyStop();
    console.log("Emergency stop released. Master switch is unchanged — still " + (masterSwitchOn() ? "ON" : "OFF") + ".");
    break;

  case "on": {
    const by = flag("by");
    const monthly = Number(flag("monthly"));
    if (!by || !Number.isFinite(monthly)) {
      console.error("usage: cli.mjs on --by=<name> --monthly=<number> [--daily=<number>]");
      console.error("A monthly ceiling is REQUIRED. It is never inferred.");
      process.exit(2);
    }
    const p = loadPolicy();
    p.autonomous_paid_compute = "ON";
    p.approved_by = by;
    p.approved_at = now();
    p.budget.monthly_ceiling = monthly;
    const daily = Number(flag("daily"));
    if (Number.isFinite(daily)) p.budget.daily_ceiling = daily;
    savePolicy(p);
    console.log(`AUTONOMOUS PAID COMPUTE: ON (approved by ${by}, monthly ${money(monthly)})`);
    break;
  }

  case "off": {
    const p = loadPolicy();
    p.autonomous_paid_compute = "OFF";
    savePolicy(p);
    console.log("AUTONOMOUS PAID COMPUTE: OFF");
    break;
  }

  case "approve": {
    const id = rest.find((a) => !a.startsWith("--"));
    if (!id) { console.error("usage: cli.mjs approve <TASK_ID>"); process.exit(2); }
    if (computeApprovedIds().has(id)) { console.log(`${id} already has compute approval`); break; }
    appendFileSync(APPROVALS_FILE, `${id}\n`);
    console.log(`COMPUTE approval granted: ${id}`);
    console.log("Note: this does NOT grant action/production approval.");
    break;
  }

  case "ledger": {
    const n = Number(rest.find((a) => !a.startsWith("--"))) || 15;
    const rows = readLedger().slice(-n);
    if (!rows.length) { console.log("(compute ledger empty)"); break; }
    for (const r of rows)
      console.log(`${r.at}  ${String(r.status).padEnd(24)} ${String(r.task_id).padEnd(28)} ${r.agent || "-"}  cost=${r.cost}  ${r.reason || ""}`);
    break;
  }

  default:
    console.error("usage: status | stop | resume | on | off | approve | ledger");
    process.exit(2);
}
