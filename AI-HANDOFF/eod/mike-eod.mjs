// PRODUCTION WIRING for the EOD checkpoint behind Mike's iMessage bridge.
//
// This is the layer that turns the coordinator's injected side effects into REAL ones:
// real agent state from HEARTBEATS.json, the real SSD backup destination, the real
// control plane for the Codex audit, and real outbound iMessage.
//
// The bridge stays a TRANSPORT. Authorized identity lets Mike accept an instruction; it
// is never an authorization bypass. Nothing here performs a protected action — the
// coordinator holds every consequential step for owner approval, and this file adds no
// capability that could route around that.
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleBridgeMessage } from "./bridge-integration.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);

const STALE_HEARTBEAT_MS = 6 * 60 * 60 * 1000; // 6h without a heartbeat = not reporting

/** Agents we expect to hear from. Read from the live heartbeat file, not hardcoded state. */
export function registeredAgents() {
  const f = path.join(HANDOFF, "HEARTBEATS.json");
  if (!existsSync(f)) return [];
  try { return Object.keys(JSON.parse(readFileSync(f, "utf8"))); } catch { return []; }
}

/**
 * Real agent checkpoint probe.
 *
 * An agent whose heartbeat is stale returns null, which the coordinator records as
 * `missing` and which forces the run to PARTIAL. We do NOT invent a checkpoint for a
 * silent agent — "didn't answer" and "idle" are different facts and the difference is
 * the whole point of the checkpoint.
 */
export function probeAgent(agent, nowMs = Date.now()) {
  const f = path.join(HANDOFF, "HEARTBEATS.json");
  if (!existsSync(f)) return null;
  let hb;
  try { hb = JSON.parse(readFileSync(f, "utf8"))[agent]; } catch { return null; }
  if (!hb) return null;

  const age = hb.last_seen ? nowMs - Date.parse(hb.last_seen) : Infinity;
  if (!Number.isFinite(age) || age > STALE_HEARTBEAT_MS) return null; // silent => missing

  const state = String(hb.state || "").toUpperCase();
  const blocked = Boolean(hb.blocked_reason);
  const continuation =
    blocked ? "BLOCKED_TECHNICAL"
    : state === "IDLE" ? "CHECKPOINT_COMPLETE_IDLE"
    : "CHECKPOINT_COMPLETE_CONTINUING";

  return {
    agent, status: state.toLowerCase() || "unknown",
    continuation,
    current_task_ids: hb.current_task ? [hb.current_task] : [],
    heartbeat_age_minutes: Math.round(age / 60000),
    overnight_safe: !blocked,
    // Deliberately generic: the coordinator's owner-required list decides what is held.
    next_action_kind: blocked ? "unresolved_business_decision" : "tests",
  };
}

/** Live task snapshot from the existing control plane. No second task database. */
export function loadTasks() {
  const f = path.join(HANDOFF, "MASTER_STATE.json");
  if (!existsSync(f)) return {};
  try { return JSON.parse(readFileSync(f, "utf8")).tasks || {}; } catch { return {}; }
}

/** POR mirror freshness. Returns null when it genuinely cannot be determined. */
export function porMirrorAgeHours() {
  const candidates = [
    "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/15-RAW-EXPORTS",
    path.join(REPO, "por-replication", "batches"),
  ];
  let newest = 0;
  for (const c of candidates) {
    try { newest = Math.max(newest, statSync(c).mtimeMs); } catch {}
  }
  return newest ? Math.round((Date.now() - newest) / 36e5) : null;
}

/** Queue the independent audit through the EXISTING control plane. Once per run. */
export function queueCodexAudit(run) {
  const taskId = `EOD-AUDIT-${run.short_id}`;
  const input = {
    task_id: taskId,
    created_by: "mike-eod",
    subsystem: "audit",
    owner_agent: "codex",
    verifier_agent: "claude",
    severity: "P1",
    priority: "high",
    risk_tier: 0,
    objective: `Independent end-of-day audit for run ${run.eod_run_id}. Grade evidence quality, claimed vs completed work, tested vs untested, committed vs untracked, local vs deployed, self-certified vs independently certified, and any false-green claims. Do not modify production.`,
    expected_evidence: [`AI-HANDOFF/EVIDENCE/EOD_${run.eod_run_id}.json`],
  };
  try {
    execFileSync("node", [path.join(HANDOFF, "control-plane.mjs"), "create", JSON.stringify(input)],
      { cwd: REPO, encoding: "utf8", timeout: 30000 });
    return taskId;
  } catch (err) {
    // An audit that could not be queued is reported, never silently skipped.
    if (/already exists/.test(String(err.message))) return taskId;
    throw new Error(`codex audit not queued: ${String(err.message).slice(0, 120)}`);
  }
}

/** Real backup destination — the SSD canonical store. */
export const BACKUP_SOURCE = REPO;
export const BACKUP_DESTINATION = "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN";

/**
 * The concise operational completion text. Every number is derived from the run —
 * nothing is asserted that the run did not actually produce.
 */
export function completionText(run, report) {
  const done = run.checkpoints.filter((c) => c.reported).length;
  const total = run.checkpoints.length;
  const missing = run.checkpoints.filter((c) => !c.reported).map((c) => c.agent);
  const blockers = (run.reconciliation?.findings || []).filter((f) => f.severity === "P0" || f.severity === "P1");
  const held = (run.continuation_decisions || []).filter((c) => c.decision === "BLOCKED_OWNER_REQUIRED");

  const verdict = run.status === "MORNING_REPORT_READY" ? "PASS"
    : blockers.some((b) => b.severity === "P0") ? "BLOCKED" : "PARTIAL";

  const lines = [
    `EOD ${run.short_id}: ${verdict}`,
    `Checkpoints: ${done}/${total} agents reported${missing.length ? ` (no answer: ${missing.join(", ")})` : ""}`,
    `Backup: ${run.backup?.status || "NOT RUN"}${run.backup?.reason ? ` — ${run.backup.reason}` : ""}`,
    `Audit: ${run.codex_audit_task ? `queued (${run.codex_audit_task})` : "NOT QUEUED"}`,
  ];
  if (blockers.length) lines.push(`Issues: ${blockers.slice(0, 3).map((b) => b.code).join(", ")}`);
  lines.push(held.length
    ? `You need to act on ${held.length} held item(s): ${held.map((h) => h.held_action).join(", ")}.`
    : "Nothing needs you right now.");
  lines.push("Overnight work is continuing.");
  return lines.join("\n");
}

/**
 * The single call the iMessage bridge makes. Returns null for non-EOD messages so
 * ordinary conversation falls through to Mike untouched.
 */
export async function mikeEodCommand({ text, senderHandle, messageRowId }, config, send) {
  return handleBridgeMessage(
    { text, senderHandle, messageRowId },
    config,
    {
      agents: registeredAgents(),
      probeAgent,
      loadTasks,
      porMirrorAgeHours: porMirrorAgeHours(),
      backupSource: BACKUP_SOURCE,
      backupDestination: BACKUP_DESTINATION,
      queueCodexAudit,
      send,
      completionText,
    },
  );
}
