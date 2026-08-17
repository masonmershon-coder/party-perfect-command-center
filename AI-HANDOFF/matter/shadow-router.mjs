#!/usr/bin/env node
// MATTER V2 — PROVIDER-NEUTRAL SHADOW DISPATCH. Deterministic. Calls no model. EXECUTES NOTHING.
//
// SHADOW MODE: for each task, the LEGACY dispatcher's choice and the V2 capability router's
// choice are computed INDEPENDENTLY and compared. Neither overwrites the other. The legacy
// dispatcher remains the executor. This file cannot dispatch, launch, or transition anything —
// it only observes and reports, which is what makes it safe to run alongside live work.
//
//   node shadow-router.mjs --compare '<task json>'   one comparison
//   node shadow-router.mjs --report                  agreement/disagreement summary
//
// The legacy mapping below is READ FROM control-plane.mjs SOURCE, not re-implemented. That
// matters: the comparison reflects what the live system would actually do today, and it keeps
// working if someone edits the legacy map.
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { route as v2route, policy } from "./matter-registry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const DIR = process.env.MATTER_DIR || HERE;
const SHADOW_LOG = path.join(DIR, "SHADOW_COMPARISONS.jsonl");

const now = () => new Date().toISOString();
const append = (o) => { mkdirSync(path.dirname(SHADOW_LOG), { recursive: true }); appendFileSync(SHADOW_LOG, JSON.stringify({ at: now(), ...o }) + "\n"); };
export const comparisons = () => (existsSync(SHADOW_LOG)
  ? readFileSync(SHADOW_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : []);

/**
 * Parse the LEGACY provider-name map straight out of control-plane.mjs source.
 * We deliberately do not hard-code a copy here — a copy would drift from the live system and
 * make the shadow comparison a fiction.
 */
export function legacyOwnerMap(cpPath = path.join(HANDOFF, "control-plane.mjs")) {
  try {
    const src = readFileSync(cpPath, "utf8");
    const m = src.match(/const SUBSYSTEM_OWNER\s*=\s*\{([\s\S]*?)\}\s*;/);
    if (!m) return {};
    const map = {};
    for (const pair of m[1].matchAll(/["']?([\w-]+)["']?\s*:\s*["'](\w+)["']/g)) map[pair[1]] = pair[2];
    return map;
  } catch { return {}; }
}

/** What the LIVE system would pick today: owner by subsystem name, verifier hard-coded to codex. */
export function legacyChoice(task) {
  const map = legacyOwnerMap();
  const owner = task.owner_agent || map[String(task.subsystem || "").toLowerCase()] || null;
  // orchestrate.mjs: WORKERS.codex handles verification for every READY_FOR_VERIFICATION task.
  const verifier = task.verifier_agent || "codex";
  return { primary: owner, verifier, basis: owner ? `SUBSYSTEM_OWNER["${task.subsystem}"] = "${owner}" (provider-name rule)` : "no subsystem mapping" };
}

/**
 * Run both routers and record the comparison. Returns the full record; executes nothing.
 * `legacy_is_executor: true` is stated explicitly in every record so no reader can mistake a
 * shadow result for a live dispatch.
 */
export function compare(task) {
  const legacy = legacyChoice(task);
  let v2, error = null;
  try { v2 = v2route(task); } catch (e) { v2 = null; error = String(e.message).slice(0, 200); }

  const v2primary = v2?.primary ?? null;
  const agreement = legacy.primary === v2primary ? "AGREE"
    : v2?.route === "DETERMINISTIC_SOFTWARE" ? "V2_DETERMINISTIC"
    : v2primary === null ? "V2_BLOCKED"
    : "DISAGREE";

  const record = {
    kind: "SHADOW_COMPARISON",
    task_id: task.task_id || null,
    subsystem: task.subsystem || null,
    objective: task.objective || null,
    policy_version: (() => { try { return policy().version; } catch { return null; } })(),
    legacy: { primary: legacy.primary, verifier: legacy.verifier, basis: legacy.basis },
    v2: v2 ? {
      primary: v2.primary, verifier: v2.verifier, route: v2.route ?? "WORKER",
      selection_basis: v2.selection_basis, comparator: v2.comparator_chain ?? null,
      blocked: v2.blocked ?? false, owner_approval_required: v2.owner_approval_required ?? false,
      needs_verification: v2.needs_verification ?? false,
      eligible: (v2.considered || []).filter((c) => c.eligible).map((c) => ({ worker_id: c.worker_id, cost_class: c.cost_class, cost_rung: c.cost_rung, score: c.score })),
      rejected: (v2.considered || []).filter((c) => !c.eligible).map((c) => ({ worker_id: c.worker_id, reasons: c.reasons })),
    } : { error },
    agreement,
    // The single most important field in this file:
    legacy_is_executor: true,
    v2_executed: false,
    note: "SHADOW MODE — V2 selection was computed and recorded only. Legacy dispatcher remains the executor.",
  };
  append(record);
  return record;
}

export function report() {
  const rows = comparisons().filter((r) => r.kind === "SHADOW_COMPARISON");
  const by = {};
  for (const r of rows) by[r.agreement] = (by[r.agreement] || 0) + 1;
  const total = rows.length;
  const agree = by.AGREE || 0;
  return {
    total_comparisons: total,
    agreement_rate: total ? Number((agree / total).toFixed(3)) : null,
    breakdown: by,
    disagreements: rows.filter((r) => r.agreement === "DISAGREE").map((r) => ({
      task_id: r.task_id, subsystem: r.subsystem,
      legacy: r.legacy.primary, v2: r.v2?.primary,
      why_legacy: r.legacy.basis, why_v2: r.v2?.selection_basis,
    })),
    deterministic_avoided_model: rows.filter((r) => r.agreement === "V2_DETERMINISTIC").length,
    v2_blocked_for_safety: rows.filter((r) => r.agreement === "V2_BLOCKED").map((r) => ({
      task_id: r.task_id, legacy_would_have_picked: r.legacy.primary,
      v2_rejected_everyone_because: (r.v2?.rejected || []).slice(0, 3),
    })),
    legacy_dispatch_changed: false,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--report")) { console.log(JSON.stringify(report(), null, 2)); process.exit(0); }
  const i = argv.indexOf("--compare");
  if (i >= 0 && argv[i + 1]) { console.log(JSON.stringify(compare(JSON.parse(argv[i + 1])), null, 2)); process.exit(0); }
  console.log("usage: --compare '<task json>' | --report");
  process.exit(2);
}
