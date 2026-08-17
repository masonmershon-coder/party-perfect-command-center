// PRODUCTION io for a LIVE EOD run. Everything here is READ-ONLY with respect to POR,
// ENTERPRISE, the SSD, and the control plane's authoritative state. It supplies the side
// effects runEodCheckpoint needs — agent probes, task snapshot, backup verification, the
// Codex audit hand-off, and the outbound sender — built from REAL local state, never invented.
//
// Nothing in this file writes to POR/ENTERPRISE, deploys, migrates, sends money, or stops a
// process. The only writes are: (1) a new control-plane AUDIT task requesting independent
// Codex verification, and (2) the outbound iMessage ack/completion — both intended.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outboundIsSafe } from "./eod.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);
const CONTROL_PLANE = path.join(HANDOFF, "control-plane.mjs");

const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; } };
const newestMtimeMs = (dir) => {
  let newest = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith("._")) continue; // AppleDouble sidecars are not real content
      try { newest = Math.max(newest, statSync(path.join(dir, e.name)).mtimeMs); } catch {}
    }
  } catch {}
  return newest;
};

/** Newest dated export set under a raw-exports tree (that's the real POR backup content). */
const newestExportDir = (rawExports) => {
  try {
    const dirs = readdirSync(rawExports, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("._"))
      .map((e) => ({ name: e.name, p: path.join(rawExports, e.name), m: statSync(path.join(rawExports, e.name)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return dirs[0]?.p || null;
  } catch { return null; }
};

/**
 * Derive one agent's checkpoint from the control-plane heartbeat. A heartbeat is the only
 * liveness signal an agent currently emits, so it IS the checkpoint: current task + state +
 * freshness. An agent with no heartbeat, or a STALE one, returns null — which the coordinator
 * records as `missing` and which forces the run to PARTIAL. Silence is never read as "healthy".
 */
export function probeFromHeartbeat(hb, agent, { maxStaleHours = 12 } = {}) {
  const h = hb[agent];
  if (!h || !h.last_seen) return null;
  const ageHours = (Date.now() - Date.parse(h.last_seen)) / 36e5;
  if (!(ageHours >= 0) || ageHours > maxStaleHours) return null; // stale/absent => missing
  const state = String(h.state || "").toLowerCase();
  let continuation = "CHECKPOINT_COMPLETE_IDLE";
  if (h.blocked_reason) continuation = "BLOCKED_TECHNICAL";
  else if (/work|progress|await|verif|run/.test(state)) continuation = "CHECKPOINT_COMPLETE_CONTINUING";
  return {
    status: state || "unknown",
    continuation,
    current_task_ids: h.current_task ? [h.current_task] : [],
    heartbeat_age_hours: Math.round(ageHours * 10) / 10,
    overnight_safe: !h.blocked_reason,
    // A heartbeat exposes no pending consequential action; if one existed the owning agent
    // would surface it as its own control-plane task, which reconcile() inspects separately.
    next_action_kind: "read_only_audit",
  };
}

/**
 * Build the production io object for runEodCheckpoint.
 * @param opts.send  outbound function (recipient-bound). Injected so tests can capture instead
 *                   of transmitting. In the live bridge this wraps imessage-send.
 */
export function buildProductionIo(opts = {}) {
  const heartbeatsPath = opts.heartbeatsPath || path.join(HANDOFF, "HEARTBEATS.json");
  const statePath = opts.statePath || path.join(HANDOFF, "MASTER_STATE.json");
  const ssdBrain = opts.ssdBrain || "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN";
  const rawExports = opts.rawExports || path.join(ssdBrain, "15-RAW-EXPORTS");
  // Verify the newest real export set (the actual POR data backup). Falls back to the
  // database-backups dir, then the raw-exports root — whichever exists is verified honestly.
  const backupDestination = opts.backupDestination
    || newestExportDir(rawExports)
    || path.join(ssdBrain, "01-DATABASE-BACKUPS");
  const maxStaleHours = opts.maxStaleHours ?? 12;

  const hb = readJson(heartbeatsPath, {});
  // The agents we can actually observe: heartbeat emitters, minus the deterministic dispatcher
  // (it is plumbing, not an engineering agent). Overridable for tests / future instrumentation.
  const agents = opts.agents || Object.keys(hb).filter((a) => a !== "dispatcher");

  // POR mirror freshness = newest artifact under the SSD raw-exports tree (best-effort, read-only).
  const mirrorMs = newestMtimeMs(rawExports);
  const porMirrorAgeHours = mirrorMs ? Math.round((Date.now() - mirrorMs) / 36e5) : null;

  const send = opts.send
    ? async (message) => {
        const gate = outboundIsSafe(message);
        if (!gate.safe) throw new Error("outbound blocked: message failed the secret/PII safety gate");
        return opts.send(message);
      }
    : null;

  return {
    agents,
    probeAgent: (agent) => probeFromHeartbeat(hb, agent, { maxStaleHours }),
    loadTasks: () => readJson(statePath, { tasks: {} }).tasks || {},
    backupSource: REPO, // a distinct local path so verifyBackup's "not inside source" check is meaningful
    backupDestination,
    porMirrorAgeHours,
    queueCodexAudit: opts.queueCodexAudit || defaultQueueCodexAudit,
    send,
  };
}

/**
 * Dispatch independent verification to Codex THROUGH THE EXISTING CONTROL PLANE.
 * Creates an AUDIT task (owner claude — who owns this coordinator; verifier codex) and moves
 * it to READY_FOR_VERIFICATION with the run's evidence attached, so it lands in Codex's verify
 * queue. Deterministic CLI calls only; no LLM. Returns the task id, or throws (recorded as a
 * run error — never a silent success).
 */
export async function defaultQueueCodexAudit(run) {
  const taskId = `EOD-AUDIT-${run.short_id}`;
  const cp = (...args) => spawnSync("node", [CONTROL_PLANE, ...args], { encoding: "utf8" });
  const evidence = [
    path.join("AI-HANDOFF", "eod", "runs", `${run.eod_run_id}.json`),
    path.join("AI-HANDOFF", "EVIDENCE", `EOD_${run.eod_run_id}.json`),
  ].join(",");

  const created = cp("create", JSON.stringify({
    task_id: taskId,
    subsystem: "observer",
    owner_agent: "claude",
    verifier_agent: "codex",
    objective: `Independently verify EOD safety-checkpoint run ${run.eod_run_id} (${run.business_date}${run.test_mode ? ", TEST" : ""})`,
    severity: "P2",
    priority: "normal",
    expected_evidence: "EOD run record + EVIDENCE bundle; confirm PARTIAL/complete verdict, agent-miss handling, backup status, and no shutdown occurred",
    acceptance_criteria: "Verifier reproduces the run's verdict from its evidence and confirms no work was stopped and no secret/PII was emitted",
  }));
  // Idempotent: if the task already exists (re-queue), do not fail the run.
  if (created.status !== 0 && !/already exists/.test((created.stderr || "") + (created.stdout || ""))) {
    throw new Error(`control-plane create failed: ${(created.stderr || created.stdout || "").trim().slice(0, 160)}`);
  }
  if (created.status === 0) {
    cp("claim", taskId, "claude");
    cp("transition", taskId, "claude", "IN_PROGRESS");
    cp("transition", taskId, "claude", "READY_FOR_VERIFICATION",
      `--evidence=${evidence}`, `--claim=EOD run ${run.eod_run_id} complete; independent Codex verification requested`);
  }
  return taskId;
}
