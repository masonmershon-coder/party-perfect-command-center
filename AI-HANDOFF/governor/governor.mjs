// PAID AI COST GOVERNOR — DETERMINISTIC. No LLM may run without passing this.
//
// Built after the 2026-08-12 Cursor incident: a launchd trigger fired, found a
// paid runtime, and ran it three times on a task nobody had approved. The flaw
// was architectural -- "a task exists" was treated as "spend money on it".
//
// TWO INDEPENDENT AUTHORIZATIONS. Neither implies the other:
//   ACTION  authorization -> may this task write prod / deploy / touch POR / send?
//   COMPUTE authorization -> may this task burn paid/metered AI resources?
//
// No LLM is consulted here. A model must never decide whether another model is
// allowed to spend money.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GOV_DIR = path.dirname(fileURLToPath(import.meta.url));
export const HANDOFF_DIR = path.dirname(GOV_DIR);
export const REPO_DIR = path.dirname(HANDOFF_DIR);

export const POLICY_FILE = path.join(GOV_DIR, "POLICY.json");
export const APPROVALS_FILE = path.join(GOV_DIR, "COMPUTE_APPROVALS.txt");
export const EMERGENCY_STOP = path.join(GOV_DIR, "EMERGENCY_STOP");
export const LEDGER_FILE = path.join(HANDOFF_DIR, "COMPUTE_LEDGER.jsonl");
export const LOCK_DIR = path.join(GOV_DIR, ".locks");

export const now = () => new Date().toISOString();

// Every block reason is a stable machine code. "Silently did nothing" is the
// failure mode this whole file exists to prevent.
export const CODES = {
  ALLOWED: "ALLOWED",
  EMERGENCY_STOP: "BLOCKED_EMERGENCY_STOP",
  MASTER_OFF: "BLOCKED_PAID_COMPUTE",
  NO_BUDGET: "BLOCKED_NO_BUDGET_APPROVED",
  NOT_APPROVED: "BLOCKED_COMPUTE_NOT_APPROVED",
  BUDGET_EXCEEDED: "BLOCKED_BUDGET_EXCEEDED",
  RETRY_LIMIT: "BLOCKED_RETRY_LIMIT",
  REPAIR_LIMIT: "BLOCKED_REPAIR_LIMIT",
  ACTION_NOT_AUTHORIZED: "BLOCKED_ACTION_NOT_AUTHORIZED",
  ALREADY_RUNNING: "BLOCKED_ALREADY_RUNNING",
  UNKNOWN_RUNTIME: "BLOCKED_UNKNOWN_RUNTIME",
};

// ---------------------------------------------------------------- policy
/**
 * DEFAULT IS OFF and budgets are null -- deliberately unset. Inventing a dollar
 * ceiling would be the same class of mistake as inventing a POR price.
 */
export const DEFAULT_POLICY = {
  autonomous_paid_compute: "OFF",
  approved_by: null,
  approved_at: null,
  budget: {
    currency: "USD",
    monthly_ceiling: null,
    daily_ceiling: null,
    per_task_ceiling: null,
    per_agent_ceiling: {},
  },
  limits: {
    max_retries: 1,
    max_repair_loops: 2,
    max_runtime_seconds: 600,
    max_concurrent_paid_agents: 1,
  },
  // Fixed subscriptions are NOT autonomous compute. Tracked separately so a
  // variable-spend ledger is never confused with the recurring baseline.
  fixed_monthly_baseline: {
    note: "Owner-reported. Do not modify without Mason.",
    supabase: 25,
    claude: 100,
    chatgpt: 20,
    grok: 99,
    vercel_domain_yearly: 10,
    effective_monthly: 244.83,
    effective_yearly: 2938,
  },
};

export function loadPolicy() {
  if (!existsSync(POLICY_FILE)) return { ...DEFAULT_POLICY };
  try {
    return { ...DEFAULT_POLICY, ...JSON.parse(readFileSync(POLICY_FILE, "utf8")) };
  } catch {
    return { ...DEFAULT_POLICY }; // unparseable policy => safest policy
  }
}

export function savePolicy(policy) {
  mkdirSync(GOV_DIR, { recursive: true });
  writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2));
}

export const masterSwitchOn = (p = loadPolicy()) =>
  String(p.autonomous_paid_compute).toUpperCase() === "ON";

/** A budget must be explicitly approved with a real monthly ceiling. */
export const budgetApproved = (p = loadPolicy()) =>
  Boolean(p.approved_by) && typeof p.budget?.monthly_ceiling === "number";

// ---------------------------------------------------------------- approvals
export function computeApprovedIds() {
  if (!existsSync(APPROVALS_FILE)) return new Set();
  return new Set(
    readFileSync(APPROVALS_FILE, "utf8")
      .split("\n")
      .map((l) => l.split("#")[0].trim())
      .filter(Boolean),
  );
}

/**
 * COMPUTE authorization. Deliberately explicit: risk tier is about ACTION
 * danger, not spend, so a harmless tier-0 task still may not spend by default.
 */
export function hasComputeApproval(task, approved = computeApprovedIds()) {
  if (approved.has("*")) return true;
  if (approved.has(task.task_id)) return true;
  return task.compute_approved === true;
}

/**
 * ACTION authorization -- entirely separate axis. A task that may spend compute
 * still may not deploy, and a task approved to deploy still may not spend.
 */
export function hasActionApproval(task) {
  if (!task.approval_required) return true; // nothing consequential requested
  return task.approval_granted === true;
}

// ---------------------------------------------------------------- ledger
export function appendLedger(entry) {
  mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  const row = {
    at: now(),
    task_id: entry.task_id ?? null,
    agent: entry.agent ?? null,
    runtime: entry.runtime ?? null,
    model: entry.model ?? "UNKNOWN",
    started_at: entry.started_at ?? null,
    stopped_at: entry.stopped_at ?? null,
    duration_ms: entry.duration_ms ?? null,
    status: entry.status,
    retry: entry.retry ?? 0,
    tokens: entry.tokens ?? "UNKNOWN",
    cost: entry.cost ?? "UNKNOWN",
    cost_basis: entry.cost_basis ?? "variable",
    reason: entry.reason ?? null,
    authorized_by: entry.authorized_by ?? null,
    result: entry.result ?? null,
  };
  appendFileSync(LEDGER_FILE, JSON.stringify(row) + "\n");
  return row;
}

export function readLedger() {
  if (!existsSync(LEDGER_FILE)) return [];
  return readFileSync(LEDGER_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const numeric = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Spend totals. Any UNKNOWN cost makes the total UNKNOWN-tainted -- we never
 * report $0 when the truth is "we cannot measure it".
 */
export function spendSummary(ledger = readLedger()) {
  const today = now().slice(0, 10);
  const month = now().slice(0, 7);
  const runs = ledger.filter((r) => r.status === "COMPLETED" || r.status === "STARTED");
  const sum = (rows) => {
    let total = 0;
    let unknown = 0;
    for (const r of rows) {
      const c = numeric(r.cost);
      if (c === null) unknown += 1;
      else total += c;
    }
    return { total, unknown_runs: unknown, known_runs: rows.length - unknown };
  };
  return {
    today: sum(runs.filter((r) => r.at.startsWith(today))),
    month_to_date: sum(runs.filter((r) => r.at.startsWith(month))),
    total_runs: runs.length,
  };
}

export function taskAttempts(taskId, ledger = readLedger()) {
  return ledger.filter((r) => r.task_id === taskId && r.status === "STARTED").length;
}

// ---------------------------------------------------------------- locks
export function lockPath(taskId) {
  return path.join(LOCK_DIR, `${String(taskId).replace(/[^A-Za-z0-9_-]/g, "_")}.lock`);
}

/** Single-flight per TASK_ID. A dead pid releases the lock; a live one holds it. */
export function isLocked(taskId) {
  const f = lockPath(taskId);
  if (!existsSync(f)) return false;
  try {
    const { pid } = JSON.parse(readFileSync(f, "utf8"));
    process.kill(pid, 0); // throws if not running
    return true;
  } catch {
    rmSync(f, { force: true });
    return false;
  }
}

export function activePaidRuns() {
  mkdirSync(LOCK_DIR, { recursive: true });
  return readdirSync(LOCK_DIR)
    .filter((f) => f.endsWith(".lock"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(path.join(LOCK_DIR, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((r) => {
      try {
        process.kill(r.pid, 0);
        return true;
      } catch {
        return false;
      }
    });
}

// ---------------------------------------------------------------- emergency
export const emergencyStopEngaged = () => existsSync(EMERGENCY_STOP);

export function engageEmergencyStop(reason, by = "unknown") {
  mkdirSync(GOV_DIR, { recursive: true });
  writeFileSync(EMERGENCY_STOP, JSON.stringify({ at: now(), reason, by }, null, 2));
}

export function releaseEmergencyStop() {
  rmSync(EMERGENCY_STOP, { force: true });
}

// ---------------------------------------------------------------- THE GATE
/**
 * The single decision point. Every paid invocation in the system must call this
 * and honour a non-ALLOWED result. Order matters: cheapest/hardest stops first.
 */
export function authorizePaidCompute(task, opts = {}) {
  const policy = opts.policy || loadPolicy();
  const agent = opts.agent || task.owner_agent || "unknown";
  const deny = (code, reason) => ({ allowed: false, code, reason, agent, task_id: task.task_id });

  if (emergencyStopEngaged())
    return deny(CODES.EMERGENCY_STOP, "emergency stop is engaged");

  if (!masterSwitchOn(policy))
    return deny(CODES.MASTER_OFF, "AUTONOMOUS_PAID_COMPUTE is OFF");

  if (!budgetApproved(policy))
    return deny(CODES.NO_BUDGET, "no owner-approved budget with a monthly ceiling");

  if (!hasComputeApproval(task))
    return deny(CODES.NOT_APPROVED, `${task.task_id} has no compute approval`);

  if (!hasActionApproval(task))
    return deny(
      CODES.ACTION_NOT_AUTHORIZED,
      `${task.task_id} requires owner action approval that has not been granted`,
    );

  const ledger = opts.ledger || readLedger();
  const spend = spendSummary(ledger);
  const b = policy.budget || {};
  if (numeric(b.monthly_ceiling) !== null && spend.month_to_date.total >= b.monthly_ceiling)
    return deny(CODES.BUDGET_EXCEEDED, `month-to-date ${spend.month_to_date.total} >= ceiling ${b.monthly_ceiling}`);
  if (numeric(b.daily_ceiling) !== null && spend.today.total >= b.daily_ceiling)
    return deny(CODES.BUDGET_EXCEEDED, `today ${spend.today.total} >= daily ceiling ${b.daily_ceiling}`);

  const attempts = taskAttempts(task.task_id, ledger);
  const maxRetries = policy.limits?.max_retries ?? 1;
  if (attempts > maxRetries)
    return deny(CODES.RETRY_LIMIT, `${attempts} attempts exceeds max_retries ${maxRetries}`);

  const repairs = opts.repairCount ?? 0;
  const maxRepairs = policy.limits?.max_repair_loops ?? 2;
  if (repairs > maxRepairs)
    return deny(CODES.REPAIR_LIMIT, `${repairs} repair loops exceeds max ${maxRepairs}`);

  if (isLocked(task.task_id))
    return deny(CODES.ALREADY_RUNNING, `a paid run for ${task.task_id} is already in flight`);

  const active = activePaidRuns().length;
  const maxConcurrent = policy.limits?.max_concurrent_paid_agents ?? 1;
  if (active >= maxConcurrent)
    return deny(CODES.ALREADY_RUNNING, `${active} paid agents already running (max ${maxConcurrent})`);

  return {
    allowed: true,
    code: CODES.ALLOWED,
    reason: "all gates passed",
    agent,
    task_id: task.task_id,
    authorized_by: `policy:${policy.approved_by}`,
    attempt: attempts + 1,
  };
}
