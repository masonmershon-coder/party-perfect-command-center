// OWNER DASHBOARD BACKEND — the single JSON contract the Command Center Owner
// page and Matter both read. Deterministic; no LLM anywhere.
//
//   node dashboard.mjs            human-readable board
//   node dashboard.mjs --json     the contract payload (this is what Cursor builds against)
//   node dashboard.mjs --answer "how much did AI cost today?"
//
// Matter answers from THIS payload. It must never estimate a number itself.
import {
  aggregate, groupBy, fixedSummary, unreconciled, detectWaste,
  readIncidents, readReconciliations, loadFixed,
} from "./accounting.mjs";
import {
  readLedger, loadPolicy, masterSwitchOn, budgetApproved, activePaidRuns,
  emergencyStopEngaged, computeApprovedIds, now,
} from "./governor.mjs";

export function buildPayload(at = new Date()) {
  const ledger = readLedger();
  const policy = loadPolicy();
  const agg = aggregate(ledger, at);
  const fixed = fixedSummary();
  const active = activePaidRuns();
  const incidents = readIncidents();
  const blocked = ledger.filter((r) => String(r.status).startsWith("BLOCKED_"));

  const budget = policy.budget || {};
  const configured = budgetApproved(policy);

  return {
    generated_at: now(),
    schema_version: 1,

    // ---- top section: understandable in 10 seconds ----
    headline: {
      today: agg.today.display,
      this_week: agg.week.display,
      this_month: agg.month.display,
      projected_month: agg.projected_month.value == null
        ? "UNKNOWN"
        : `$${agg.projected_month.value.toFixed(2)}`,
      projected_basis: agg.projected_month.basis,
      projected_confidence: agg.projected_month.confidence,
      known_fixed_monthly: `$${fixed.known_monthly.toFixed(2)}`,
      fixed_source: fixed.source,
      fixed_verified_against_provider: fixed.verified_against_provider,
      variable_compute: agg.month.display,
      unreconciled: unreconciled(ledger).display,
      monthly_budget: configured ? `$${Number(budget.monthly_ceiling).toFixed(2)}` : "NOT CONFIGURED",
      budget_remaining:
        configured && agg.month.known_runs > 0
          ? `$${(budget.monthly_ceiling - agg.month.known_total).toFixed(2)}`
          : configured ? `$${Number(budget.monthly_ceiling).toFixed(2)}` : "NOT CONFIGURED",
    },

    // ---- provider view ----
    providers: buildProviders(ledger, agg),

    // ---- agent view ----
    agents: buildAgents(ledger),

    // ---- project view ----
    projects: groupBy(ledger, "project"),

    // ---- live activity ----
    live_activity: active.map((a) => ({
      runtime: a.runtime, agent: a.agent, task_id: a.task_id, pid: a.pid,
      started_at: a.started_at,
      runtime_seconds: a.started_at ? Math.round((Date.now() - Date.parse(a.started_at)) / 1000) : null,
      cost_so_far: "UNKNOWN",
      authorization: "APPROVED (governor)",
      budget_status: configured ? "NORMAL" : "NOT CONFIGURED",
    })),

    // ---- guardrails ----
    guardrails: {
      paid_compute: masterSwitchOn(policy) ? "ARMED" : "DISARMED",
      emergency_stop: emergencyStopEngaged() ? "ENGAGED" : "clear",
      daily_budget: budget.daily_ceiling == null ? "NOT CONFIGURED" : `$${budget.daily_ceiling}`,
      monthly_budget: budget.monthly_ceiling == null ? "NOT CONFIGURED" : `$${budget.monthly_ceiling}`,
      budget_utilization:
        configured && agg.month.known_runs > 0
          ? `${((agg.month.known_total / budget.monthly_ceiling) * 100).toFixed(1)}%`
          : "UNKNOWN",
      compute_approved_tasks: [...computeApprovedIds()],
      limits: policy.limits,
      blocked_attempts: blocked.length,
      recent_guardrail_events: blocked.slice(-10).map((b) => ({
        at: b.timestamp || b.at, task_id: b.task_id, code: b.status, reason: b.reason,
      })),
    },

    // ---- incidents ----
    incidents: incidents.map((i) => ({
      incident_id: i.incident_id, type: i.type, severity: i.severity,
      occurred_at: i.occurred_at, summary: i.summary, status: i.status,
      cost: i.cost_amount == null ? "UNKNOWN" : `$${i.cost_amount.toFixed(2)}`,
      cost_classification: i.cost_classification,
    })),

    // ---- optimization ----
    waste: detectWaste(ledger),

    // ---- reconciliation ----
    reconciliation: readReconciliations().slice(-10),

    // ---- honesty flags: what this payload cannot tell you ----
    blind_spots: buildBlindSpots(ledger, fixed),
  };
}

function buildProviders(ledger, agg) {
  const byProvider = groupBy(ledger, "provider");
  const fixed = fixedSummary();
  const fx = Object.fromEntries((loadFixed().subscriptions || []).map((s) => [s.provider, s]));
  const names = new Set([...Object.keys(byProvider), ...Object.keys(fx)]);
  const out = {};
  for (const p of names) {
    const usage = byProvider[p] || { display: "$0.00", known_runs: 0, unknown_runs: 0, runs: 0 };
    const sub = fx[p];
    out[p] = {
      fixed_subscription:
        sub == null ? "none"
          : sub.cadence === "UNKNOWN" || (sub.monthly == null && sub.yearly == null)
            ? "UNKNOWN"
            : sub.cadence === "yearly" ? `$${sub.yearly}/yr` : `$${sub.monthly}/mo`,
      fixed_verified: sub ? sub.verified === true : null,
      variable_usage_month: usage.display,
      runs_month: usage.runs,
      unknown_cost_runs: usage.unknown_runs,
      last_usage: lastUsage(ledger, p),
      status: sub && sub.cadence === "UNKNOWN" ? "PRICE NOT ESTABLISHED" : "ok",
    };
  }
  void agg;
  void fixed;
  return out;
}

function lastUsage(ledger, provider) {
  const rows = ledger.filter((r) => r.provider === provider && r.timestamp);
  return rows.length ? rows[rows.length - 1].timestamp : "never";
}

function buildAgents(ledger) {
  const byAgent = {};
  for (const r of ledger) {
    if (!r.agent) continue;
    (byAgent[r.agent] ||= []).push(r);
  }
  const out = {};
  for (const [agent, rows] of Object.entries(byAgent)) {
    const runs = rows.filter((r) => ["COMPLETED", "FAILED", "TIMEOUT_KILLED"].includes(r.status));
    const ok = rows.filter((r) => r.status === "COMPLETED");
    const failed = rows.filter((r) => ["FAILED", "TIMEOUT_KILLED"].includes(r.status));
    const retries = rows.filter((r) => (r.retry_number ?? 0) > 0);
    const seconds = rows.reduce((a, r) => a + (r.duration_seconds ?? (r.duration_ms ? r.duration_ms / 1000 : 0)), 0);
    const tokens = rows.reduce((a, r) => a + (r.total_tokens ?? 0), 0);
    const costRows = rows.filter((r) => typeof r.cost_amount === "number");
    const knownCost = costRows.reduce((a, r) => a + r.cost_amount, 0);
    out[agent] = {
      runs: runs.length,
      successful: ok.length,
      failed: failed.length,
      retries: retries.length,
      compute_seconds: Math.round(seconds),
      tokens: tokens || "UNKNOWN",
      cost: costRows.length ? `$${knownCost.toFixed(2)}` : "UNKNOWN",
      cost_per_successful_task:
        costRows.length && ok.length ? `$${(knownCost / ok.length).toFixed(2)}` : "UNKNOWN",
    };
  }
  return out;
}

function buildBlindSpots(ledger, fixed) {
  const spots = [];
  const unknownRuns = ledger.filter(
    (r) => ["COMPLETED", "STARTED"].includes(r.status) && r.cost_amount == null,
  ).length;
  if (unknownRuns)
    spots.push(`${unknownRuns} executed run(s) have no cost data — displayed as UNKNOWN, never $0`);
  if (fixed.unknown_price_subscriptions.length)
    spots.push(`subscription price not established: ${fixed.unknown_price_subscriptions.join(", ")}`);
  if (!fixed.verified_against_provider)
    spots.push("fixed costs are owner-reported, not provider-verified");
  return spots;
}

// ---------------------------------------------------------------- answers
/** Matter's query layer. Deterministic lookups into the payload — no guessing. */
export function answer(question, payload = buildPayload()) {
  const q = String(question).toLowerCase();
  const h = payload.headline;
  if (/today/.test(q)) return `Today: ${h.today}.${h.today.includes("UNKNOWN") ? " Some runs have no cost data from the provider." : ""}`;
  if (/this month|month.to.date|month/.test(q) && !/project/.test(q))
    return `Month to date: ${h.this_month}. Projected: ${h.projected_month} (${h.projected_confidence} confidence).`;
  if (/week/.test(q)) return `This week: ${h.this_week}.`;
  if (/unauthor|without authoriz|not authoriz|unapproved/.test(q)) {
    const inc = payload.incidents.filter((i) => i.type === "UNAUTHORIZED_COMPUTE");
    return inc.length
      ? `Yes — ${inc.length} unauthorized-compute incident(s): ${inc.map((i) => `${i.incident_id} (${i.cost})`).join(", ")}.`
      : "No unauthorized-compute incidents recorded.";
  }
  if (/most|highest|costing us the most/.test(q)) {
    const ranked = Object.entries(payload.agents)
      .filter(([, a]) => a.cost !== "UNKNOWN")
      .sort((a, b) => parseFloat(b[1].cost.slice(1)) - parseFloat(a[1].cost.slice(1)));
    return ranked.length
      ? `Highest known spend: ${ranked[0][0]} at ${ranked[0][1].cost}.`
      : "Cannot rank — no agent has known dollar cost yet. All spend is UNKNOWN.";
  }
  if (/wast|avoidable/.test(q))
    return payload.waste.length
      ? payload.waste.map((w) => `${w.type}: ${w.summary} (${w.avoidable_cost})`).join("; ")
      : "No waste signals detected.";
  if (/por/.test(q)) {
    const p = payload.projects["por-bridge"];
    return p ? `POR bridge project: ${p.display}.` : "No spend attributed to the POR project yet.";
  }
  if (/cursor/.test(q)) {
    const c = payload.providers.cursor;
    return c ? `Cursor — subscription ${c.fixed_subscription}, variable this month ${c.variable_usage_month}, last usage ${c.last_usage}.` : "No Cursor data.";
  }
  if (/budget/.test(q)) return `Monthly budget: ${h.monthly_budget}. Remaining: ${h.budget_remaining}.`;
  return "I can answer from the cost ledger: today, this week, this month, projected, by provider, by agent, by project, waste, incidents, budget. I will not estimate a number that isn't measured.";
}

// ---------------------------------------------------------------- cli
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const payload = buildPayload();
  const ansIdx = argv.indexOf("--answer");
  if (ansIdx >= 0) {
    console.log(answer(argv[ansIdx + 1] || "", payload));
  } else if (argv.includes("--json")) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    const h = payload.headline;
    console.log([
      "============== OWNER → AI COST & CONTROL ==============",
      `TODAY              ${h.today}`,
      `THIS WEEK          ${h.this_week}`,
      `THIS MONTH         ${h.this_month}`,
      `PROJECTED MONTH    ${h.projected_month}  (${h.projected_confidence})`,
      `KNOWN FIXED /mo    ${h.known_fixed_monthly}  [${h.fixed_source}]`,
      `VARIABLE COMPUTE   ${h.variable_compute}`,
      `UNRECONCILED       ${h.unreconciled}`,
      `MONTHLY BUDGET     ${h.monthly_budget}`,
      "",
      `PAID COMPUTE       ${payload.guardrails.paid_compute}`,
      `EMERGENCY STOP     ${payload.guardrails.emergency_stop}`,
      `BLOCKED ATTEMPTS   ${payload.guardrails.blocked_attempts}`,
      `ACTIVE PAID AGENTS ${payload.live_activity.length}`,
      `INCIDENTS          ${payload.incidents.length}`,
      "",
      "BLIND SPOTS:",
      ...(payload.blind_spots.length ? payload.blind_spots.map((b) => `  - ${b}`) : ["  none"]),
      "=======================================================",
    ].join("\n"));
  }
}
