// CENTRAL AI COST ACCOUNTING — DETERMINISTIC. No LLM adds up bills.
//
// One normalized ledger for every provider/agent/runtime. Extends the governor's
// COMPUTE_LEDGER.jsonl rather than creating a second accounting silo.
//
// THE RULE THAT MATTERS MOST:
//   UNKNOWN is not $0. $0 means VERIFIED ZERO COST.
//   Every aggregate carries its unknown count so the dashboard can never make
//   spend look smaller because a provider hides billing data.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { HANDOFF_DIR, GOV_DIR, LEDGER_FILE, readLedger, loadPolicy, now } from "./governor.mjs";

export const FIXED_FILE = path.join(GOV_DIR, "FIXED_SUBSCRIPTIONS.json");
export const RECON_FILE = path.join(HANDOFF_DIR, "COST_RECONCILIATION.jsonl");
export const INCIDENT_FILE = path.join(HANDOFF_DIR, "COST_INCIDENTS.jsonl");

/** Cost provenance. Never mix these — the dashboard shows them apart. */
export const COST_CLASS = {
  ACTUAL: "ACTUAL",                       // provider-reported dollars
  CALCULATED: "CALCULATED",               // tokens x published price
  ESTIMATED: "ESTIMATED",                 // heuristic (duration-based); lowest trust
  FIXED_SUBSCRIPTION: "FIXED_SUBSCRIPTION",
  UNKNOWN: "UNKNOWN",                     // measurable in principle, not available
};

export const PROVIDERS = [
  "anthropic", "cursor", "openai", "xai", "supabase", "vercel", "other",
];

export const PROJECTS = [
  "party-perfect", "matter", "command-center", "por-bridge", "mike", "madison",
  "security", "codex-audit", "cursor-development", "website", "marketing",
  "personal-mershon", "other",
];

// ---------------------------------------------------------------- event
/**
 * Normalized usage event. Unset numeric fields stay null, never 0 — a null
 * token count means "not reported", which is a different fact from zero tokens.
 */
export function makeUsageEvent(input) {
  const ev = {
    event_id: input.event_id || eventId(input),
    timestamp: input.timestamp || now(),
    task_id: input.task_id ?? null,
    correlation_id: input.correlation_id ?? input.task_id ?? null,
    parent_run_id: input.parent_run_id ?? null,

    agent: input.agent ?? null,
    provider: input.provider ?? "other",
    runtime: input.runtime ?? null,
    model: input.model ?? "UNKNOWN",
    project: input.project ?? "other",
    domain: input.domain ?? null,

    manual_or_autonomous: input.manual_or_autonomous ?? "autonomous",
    trigger_source: input.trigger_source ?? null,

    authorization_id: input.authorization_id ?? null,
    authorization_type: input.authorization_type ?? null,
    risk_tier: input.risk_tier ?? null,

    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    duration_seconds: input.duration_seconds ?? null,

    input_tokens: numOrNull(input.input_tokens),
    output_tokens: numOrNull(input.output_tokens),
    cached_tokens: numOrNull(input.cached_tokens),
    total_tokens: numOrNull(input.total_tokens),
    api_calls: numOrNull(input.api_calls),

    cost_amount: numOrNull(input.cost_amount),
    currency: input.currency ?? "USD",
    cost_classification: input.cost_classification ?? COST_CLASS.UNKNOWN,
    pricing_source: input.pricing_source ?? null,
    pricing_version: input.pricing_version ?? null,

    retry_number: input.retry_number ?? 0,
    status: input.status ?? "UNKNOWN",
    result: input.result ?? null,
    verification_status: input.verification_status ?? null,
  };

  // A cost with no provenance is unusable; force it to UNKNOWN rather than
  // letting a bare number imply it was verified.
  if (ev.cost_amount != null && ev.cost_classification === COST_CLASS.UNKNOWN)
    ev.cost_classification = COST_CLASS.ESTIMATED;
  if (ev.cost_amount == null) ev.cost_classification = ev.cost_classification === COST_CLASS.FIXED_SUBSCRIPTION
    ? COST_CLASS.FIXED_SUBSCRIPTION : COST_CLASS.UNKNOWN;

  assertNoSecrets(ev);
  return ev;
}

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function eventId(input) {
  return createHash("sha1")
    .update(`${input.task_id}|${input.agent}|${input.start_time || ""}|${input.runtime}|${input.retry_number ?? 0}`)
    .digest("hex")
    .slice(0, 16);
}

const SECRET_RE = /(sk-[A-Za-z0-9]{16}|xai-[A-Za-z0-9]{16}|AKIA[0-9A-Z]{16}|postgres(ql)?:\/\/[^\s"']+:[^\s"']+@|Bearer\s+[A-Za-z0-9._-]{20})/i;
function assertNoSecrets(ev) {
  if (SECRET_RE.test(JSON.stringify(ev)))
    throw new Error("REJECTED: usage event contains a secret value");
}

/** Append with idempotency — the same event_id is never double-counted. */
export function recordUsage(input) {
  const ev = makeUsageEvent(input);
  const existing = new Set(readLedger().map((r) => r.event_id).filter(Boolean));
  if (existing.has(ev.event_id)) return { recorded: false, reason: "duplicate event_id", event: ev };
  mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  appendFileSync(LEDGER_FILE, JSON.stringify(ev) + "\n");
  return { recorded: true, event: ev };
}

// ---------------------------------------------------------------- fixed
/**
 * Fixed subscriptions are MANUALLY REPORTED by the owner. They are never
 * promoted to provider-verified without reconciliation evidence.
 */
export const DEFAULT_FIXED = {
  source: "MANUALLY_REPORTED_BY_OWNER",
  verified_against_provider: false,
  updated_at: "2026-08-12",
  subscriptions: [
    { provider: "supabase", label: "Supabase", monthly: 25, cadence: "monthly", verified: false },
    { provider: "anthropic", label: "Claude", monthly: 100, cadence: "monthly", verified: false },
    { provider: "openai", label: "ChatGPT", monthly: 20, cadence: "monthly", verified: false },
    { provider: "xai", label: "Grok", monthly: 99, cadence: "monthly", verified: false },
    { provider: "vercel", label: "Vercel / domain", monthly: null, yearly: 10, cadence: "yearly", verified: false },
    { provider: "cursor", label: "Cursor", monthly: null, cadence: "UNKNOWN", verified: false,
      note: "Plan and price NOT YET ESTABLISHED — must not be counted as $0." },
  ],
  owner_reported_effective_monthly: 244.83,
  owner_reported_effective_yearly: 2938,
};

export function loadFixed() {
  if (!existsSync(FIXED_FILE)) return DEFAULT_FIXED;
  try {
    return JSON.parse(readFileSync(FIXED_FILE, "utf8"));
  } catch {
    return DEFAULT_FIXED;
  }
}
export function saveFixed(f) {
  mkdirSync(GOV_DIR, { recursive: true });
  writeFileSync(FIXED_FILE, JSON.stringify(f, null, 2));
}

/** Known fixed monthly + how many subscriptions have no known price. */
export function fixedSummary(fixed = loadFixed()) {
  let known = 0;
  const unknown = [];
  for (const s of fixed.subscriptions) {
    const m = s.cadence === "yearly" && typeof s.yearly === "number" ? s.yearly / 12 : s.monthly;
    if (typeof m === "number") known += m;
    else unknown.push(s.label);
  }
  return {
    known_monthly: Number(known.toFixed(2)),
    owner_reported_monthly: fixed.owner_reported_effective_monthly ?? null,
    owner_reported_yearly: fixed.owner_reported_effective_yearly ?? null,
    unknown_price_subscriptions: unknown,
    source: fixed.source,
    verified_against_provider: fixed.verified_against_provider === true,
  };
}

// ---------------------------------------------------------------- buckets
/**
 * Sum a set of rows, keeping unknowns visible.
 * Returns { known_total, known_runs, unknown_runs, display } where `display`
 * is what a UI should print -- never a bare number when unknowns exist.
 */
export function sumRows(rows) {
  let known = 0, knownRuns = 0, unknownRuns = 0;
  for (const r of rows) {
    const c = numOrNull(r.cost_amount ?? (typeof r.cost === "number" ? r.cost : null));
    if (c == null) unknownRuns += 1;
    else { known += c; knownRuns += 1; }
  }
  const total = Number(known.toFixed(4));
  let display;
  if (knownRuns === 0 && unknownRuns === 0) display = "$0.00";
  else if (knownRuns === 0) display = `UNKNOWN (${unknownRuns} run${unknownRuns === 1 ? "" : "s"})`;
  else display = unknownRuns ? `$${total.toFixed(2)} + ${unknownRuns} UNKNOWN` : `$${total.toFixed(2)}`;
  return { known_total: total, known_runs: knownRuns, unknown_runs: unknownRuns, display, runs: rows.length };
}

/** Local-day/week/month boundaries. Timezone handling is explicit, not implicit. */
export function periodKeys(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const month = day.slice(0, 7);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dow);
  const week = `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
  return { day, week, month, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

const localKey = (iso) => {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Only rows that represent real execution count as spend. */
const isSpendRow = (r) =>
  ["COMPLETED", "STARTED", "FAILED", "TIMEOUT_KILLED", "EMERGENCY_STOPPED"].includes(r.status);

export function aggregate(ledger = readLedger(), at = new Date()) {
  const k = periodKeys(at);
  const spend = ledger.filter(isSpendRow);
  const inDay = spend.filter((r) => localKey(r.timestamp || r.at) === k.day);
  const inWeek = spend.filter((r) => localKey(r.timestamp || r.at) >= k.week);
  const inMonth = spend.filter((r) => (r.timestamp || r.at || "").slice(0, 7) === k.month);

  const today = sumRows(inDay);
  const week = sumRows(inWeek);
  const month = sumRows(inMonth);

  // Projection is only honest when the month has known costs to extrapolate.
  const dayOfMonth = at.getDate();
  const daysInMonth = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
  const projected =
    month.known_runs > 0
      ? {
          value: Number(((month.known_total / dayOfMonth) * daysInMonth).toFixed(2)),
          basis: `known spend only; ${month.unknown_runs} run(s) excluded as UNKNOWN`,
          confidence: month.unknown_runs === 0 ? "medium" : "low",
        }
      : { value: null, basis: "no known-cost runs this month", confidence: "none" };

  return { periods: k, today, week, month, projected_month: projected };
}

/** Group by any dimension, keeping unknowns per group. */
export function groupBy(ledger, field) {
  const out = {};
  for (const r of ledger.filter(isSpendRow)) {
    const key = r[field] || "unattributed";
    (out[key] ||= []).push(r);
  }
  return Object.fromEntries(Object.entries(out).map(([k, rows]) => [k, sumRows(rows)]));
}

// ---------------------------------------------------------------- incidents
export const INCIDENT_TYPES = [
  "UNAUTHORIZED_COMPUTE", "RUNAWAY_AGENT", "RETRY_LOOP", "DUPLICATE_WORK",
  "BUDGET_EXCEEDED", "STOP_UNVERIFIED", "PROVIDER_COST_UNKNOWN",
  "RECONCILIATION_MISMATCH", "UNGATED_COMPUTE_PATH",
];

export function recordIncident(inc) {
  const row = {
    incident_id: inc.incident_id || `INC-${createHash("sha1").update(`${inc.type}|${inc.occurred_at}|${inc.summary}`).digest("hex").slice(0, 8).toUpperCase()}`,
    recorded_at: now(),
    occurred_at: inc.occurred_at ?? null,
    type: inc.type,
    severity: inc.severity ?? "P1",
    summary: inc.summary,
    task_ids: inc.task_ids ?? [],
    agent: inc.agent ?? null,
    provider: inc.provider ?? null,
    measured: inc.measured ?? {},
    cost_amount: numOrNull(inc.cost_amount),
    cost_classification: inc.cost_amount == null ? COST_CLASS.UNKNOWN : (inc.cost_classification ?? COST_CLASS.ACTUAL),
    status: inc.status ?? "OPEN",
    controls_added: inc.controls_added ?? [],
    evidence: inc.evidence ?? [],
  };
  const existing = readIncidents();
  if (existing.some((e) => e.incident_id === row.incident_id))
    return { recorded: false, incident: row };
  mkdirSync(path.dirname(INCIDENT_FILE), { recursive: true });
  appendFileSync(INCIDENT_FILE, JSON.stringify(row) + "\n");
  return { recorded: true, incident: row };
}

export function readIncidents() {
  if (!existsSync(INCIDENT_FILE)) return [];
  return readFileSync(INCIDENT_FILE, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ---------------------------------------------------------------- reconcile
export function recordReconciliation(rec) {
  const internal = numOrNull(rec.internal_calculated);
  const actual = numOrNull(rec.provider_actual);
  const row = {
    recorded_at: now(),
    provider: rec.provider,
    period: rec.period,
    internal_calculated: internal,
    provider_actual: actual,
    variance: internal != null && actual != null ? Number((actual - internal).toFixed(2)) : null,
    status:
      internal == null || actual == null
        ? "INSUFFICIENT_DATA"
        : Math.abs(actual - internal) < 0.01
          ? "RECONCILED"
          : "NEEDS_RECONCILIATION",
    evidence: rec.evidence ?? null,
    note: rec.note ?? null,
  };
  mkdirSync(path.dirname(RECON_FILE), { recursive: true });
  appendFileSync(RECON_FILE, JSON.stringify(row) + "\n");
  return row;
}

export function readReconciliations() {
  if (!existsSync(RECON_FILE)) return [];
  return readFileSync(RECON_FILE, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** Spend we have recorded but never matched to a provider bill. */
export function unreconciled(ledger = readLedger()) {
  const recon = readReconciliations();
  const reconciledPeriods = new Set(
    recon.filter((r) => r.status === "RECONCILED").map((r) => `${r.provider}|${r.period}`),
  );
  const rows = ledger.filter(isSpendRow).filter((r) => {
    const period = (r.timestamp || r.at || "").slice(0, 7);
    return !reconciledPeriods.has(`${r.provider}|${period}`);
  });
  return sumRows(rows);
}

// ---------------------------------------------------------------- waste
/**
 * Evidence-backed waste signals only. Every finding names the rows it came from
 * so nobody has to trust a number without being able to check it.
 */
export function detectWaste(ledger = readLedger()) {
  const findings = [];
  const spend = ledger.filter(isSpendRow);

  const byTask = {};
  for (const r of spend) (byTask[r.task_id] ||= []).push(r);

  for (const [taskId, rows] of Object.entries(byTask)) {
    const retries = rows.filter((r) => (r.retry_number ?? 0) > 0);
    if (retries.length >= 2)
      findings.push({
        type: "RETRY_LOOP", task_id: taskId, evidence_rows: retries.length,
        summary: `${taskId} consumed ${retries.length} retried paid runs`,
        avoidable_cost: sumRows(retries).display,
      });

    const failed = rows.filter((r) => ["FAILED", "TIMEOUT_KILLED"].includes(r.status));
    if (failed.length)
      findings.push({
        type: "FAILED_RUN_SPEND", task_id: taskId, evidence_rows: failed.length,
        summary: `${taskId} spent on ${failed.length} run(s) that produced no result`,
        avoidable_cost: sumRows(failed).display,
      });

    // Duplicate work is the SAME agent running the same task more than once
    // without it being a marked retry. Multiple DIFFERENT agents on one task is
    // the intended pipeline (cursor implements -> codex verifies), not waste.
    const perAgent = {};
    for (const r of rows) (perAgent[r.agent] ||= []).push(r);
    for (const [ag, agRows] of Object.entries(perAgent)) {
      const unmarked = agRows.filter((r) => (r.retry_number ?? 0) === 0);
      if (unmarked.length > 1)
        findings.push({
          type: "DUPLICATE_WORK", task_id: taskId, agent: ag, evidence_rows: unmarked.length,
          summary: `${ag} ran ${unmarked.length} unmarked paid runs on ${taskId} — duplicate, not retries`,
          avoidable_cost: sumRows(unmarked.slice(1)).display,
        });
    }
  }

  const untracked = spend.filter((r) => !r.task_id);
  if (untracked.length)
    findings.push({
      type: "UNTRACKED_SPEND", evidence_rows: untracked.length,
      summary: `${untracked.length} paid run(s) with no TASK_ID — cannot be attributed`,
      avoidable_cost: "UNKNOWN",
    });

  const unauthorized = spend.filter((r) => !r.authorization_id && !r.authorized_by);
  if (unauthorized.length)
    findings.push({
      type: "UNAUTHORIZED_COMPUTE", evidence_rows: unauthorized.length,
      summary: `${unauthorized.length} paid run(s) with no recorded authorization`,
      avoidable_cost: "UNKNOWN",
    });

  return findings;
}

export { readLedger, loadPolicy };
