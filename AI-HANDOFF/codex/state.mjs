// Codex audit state — DETERMINISTIC. No LLM anywhere in this file.
//
// Maintains the four files Mason (and any dashboard) can read at any moment to
// answer "everything good?" without re-deriving anything:
//
//   CODEX_CURRENT_STATUS.json  current health rollup (GREEN/YELLOW/RED)
//   CODEX_AUDIT_LEDGER.jsonl   append-only history of every verification
//   CODEX_OPEN_FINDINGS.json   open P0/P1 findings, keyed so they dedupe
//   CODEX_LAST_VERIFIED.md     human-readable "what changed / what needs you"
//
// Everything here is derived from MASTER_STATE.json + the ledger, so the files
// can always be rebuilt from source of truth.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CODEX_DIR = path.dirname(fileURLToPath(import.meta.url));
export const HANDOFF_DIR = path.dirname(CODEX_DIR);
export const REPO_DIR = path.dirname(HANDOFF_DIR);

const F = (n) => path.join(HANDOFF_DIR, n);
export const MASTER_STATE = F("MASTER_STATE.json");
export const HEARTBEATS = F("HEARTBEATS.json");
export const STATUS_FILE = F("CODEX_CURRENT_STATUS.json");
export const LEDGER_FILE = F("CODEX_AUDIT_LEDGER.jsonl");
export const FINDINGS_FILE = F("CODEX_OPEN_FINDINGS.json");
export const LAST_VERIFIED_FILE = F("CODEX_LAST_VERIFIED.md");
export const RUN_DIR = path.join(CODEX_DIR, ".runs");

export const now = () =>
  (process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000)
    : new Date()
  ).toISOString();

export function loadJson(file, fallback) {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;
  } catch {
    return fallback;
  }
}

export function loadTasks({ includeSynthetic = false } = {}) {
  const all = Object.values(loadJson(MASTER_STATE, { tasks: {} }).tasks || {});
  return includeSynthetic ? all : all.filter((t) => !isSyntheticTask(t.task_id));
}

export function appendLedger(entry) {
  mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  appendFileSync(LEDGER_FILE, JSON.stringify({ at: now(), ...entry }) + "\n");
}

/** Certification/self-test task ids. Real audit history keeps them (the ledger
 *  is append-only); Mason-facing views filter them out as noise. */
export const isSyntheticTask = (id) => /^(CERTIFY|TRIGGER)-/.test(String(id || ""));

export function readLedger({ includeSynthetic = false } = {}) {
  if (!existsSync(LEDGER_FILE)) return [];
  const rows = readFileSync(LEDGER_FILE, "utf8")
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
  return includeSynthetic ? rows : rows.filter((r) => !isSyntheticTask(r.task_id));
}

// ---------------------------------------------------------------- findings
// A finding is keyed by (task_id, code) so re-running a verification updates
// the existing row instead of piling up duplicates.
export function loadFindings() {
  return loadJson(FINDINGS_FILE, { findings: [], updated_at: null });
}

export function upsertFindings(taskId, findings) {
  const state = loadFindings();
  const keep = state.findings.filter((f) => f.task_id !== taskId);
  const next = [
    ...keep,
    ...findings.map((f) => ({
      key: `${taskId}:${f.code}`,
      task_id: taskId,
      severity: String(f.severity || "P2").toUpperCase(),
      code: f.code,
      summary: f.summary,
      evidence: f.evidence || null,
      opened_at: now(),
    })),
  ];
  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  next.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  writeFileSync(
    FINDINGS_FILE,
    JSON.stringify({ findings: next, updated_at: now() }, null, 2),
  );
  return next;
}

export function clearFindings(taskId) {
  const state = loadFindings();
  const next = state.findings.filter((f) => f.task_id !== taskId);
  writeFileSync(
    FINDINGS_FILE,
    JSON.stringify({ findings: next, updated_at: now() }, null, 2),
  );
  return next;
}

// ---------------------------------------------------------------- health
const STALE_VERIFICATION_MS = 6 * 60 * 60 * 1000; // 6h waiting = stale
const WORKER_SILENT_MS = 36 * 60 * 60 * 1000; // no heartbeat in 36h = silent

/**
 * Health rollup. Deterministic rules, no judgement calls:
 *   RED    any open P0, or a worker that cannot run at all
 *   YELLOW any open P1, stale verification, or NEEDS_FIX backlog
 *   GREEN  otherwise
 */
export function computeStatus(extra = {}) {
  const tasks = loadTasks();
  const findings = loadFindings().findings;
  const heartbeats = loadJson(HEARTBEATS, {});
  const ledger = readLedger();
  const nowMs = Date.parse(now());

  const byStatus = (s) => tasks.filter((t) => t.status === s);
  const awaiting = byStatus("READY_FOR_VERIFICATION");
  const verifying = byStatus("VERIFYING");
  const needsFix = byStatus("NEEDS_FIX");
  const blocked = byStatus("BLOCKED");

  const staleVerification = awaiting.filter(
    (t) => nowMs - Date.parse(t.last_updated_at || 0) > STALE_VERIFICATION_MS,
  );

  const p0 = findings.filter((f) => f.severity === "P0");
  const p1 = findings.filter((f) => f.severity === "P1");

  // Blocked ON MASON specifically -- those are the only ones he must act on.
  const blockedOnMason = blocked.filter((t) =>
    /login|2fa|password|physical|business-rule|approval|vendor|mason/i.test(
      String(t.error || ""),
    ),
  );

  const workerHealth = extra.worker_health || loadJson(STATUS_FILE, {}).worker_health || {};
  const workersBroken = Object.values(workerHealth).filter(
    (w) => w && w.available === false,
  ).length;

  const lastVerification = ledger
    .filter((e) => e.type === "verification")
    .slice(-1)[0] || null;

  let health = "GREEN";
  if (p0.length > 0 || workersBroken > 0) health = "RED";
  else if (p1.length > 0 || staleVerification.length > 0 || needsFix.length > 0)
    health = "YELLOW";

  const codexHb = heartbeats.codex || null;
  const codexSilent =
    codexHb && nowMs - Date.parse(codexHb.last_seen || 0) > WORKER_SILENT_MS;

  const status = {
    health,
    generated_at: now(),
    last_verified_at: lastVerification ? lastVerification.at : null,
    counts: {
      open_p0: p0.length,
      open_p1: p1.length,
      awaiting_verification: awaiting.length,
      codex_verifying: verifying.length,
      needs_fix: needsFix.length,
      blocked_total: blocked.length,
      blocked_on_mason: blockedOnMason.length,
      claude_tasks: tasks.filter(
        (t) => t.owner_agent === "claude" && !["CERTIFIED_PASS"].includes(t.status),
      ).length,
      cursor_tasks: tasks.filter(
        (t) => t.owner_agent === "cursor" && !["CERTIFIED_PASS"].includes(t.status),
      ).length,
      certified_pass: byStatus("CERTIFIED_PASS").length,
      total_tasks: tasks.length,
    },
    open_p0: p0,
    open_p1: p1,
    awaiting_verification: awaiting.map((t) => ({
      task_id: t.task_id,
      objective: t.objective,
      owner: t.owner_agent,
      since: t.last_updated_at,
      stale: staleVerification.some((s) => s.task_id === t.task_id),
    })),
    blocked_on_mason: blockedOnMason.map((t) => ({
      task_id: t.task_id,
      objective: t.objective,
      reason: t.error,
    })),
    worker_health: workerHealth,
    codex_heartbeat: codexHb,
    codex_silent: Boolean(codexSilent),
    // Confidence is mechanical: what fraction of finished work has been
    // independently certified, discounted when workers are broken.
    confidence: computeConfidence(tasks, workersBroken, p0.length),
    evidence: {
      master_state: path.relative(REPO_DIR, MASTER_STATE),
      ledger: path.relative(REPO_DIR, LEDGER_FILE),
      findings: path.relative(REPO_DIR, FINDINGS_FILE),
    },
    ...(extra.sweep ? { last_sweep: extra.sweep } : {}),
  };

  const prior = loadJson(STATUS_FILE, {});
  if (prior.last_sweep && !status.last_sweep) status.last_sweep = prior.last_sweep;

  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  return status;
}

function computeConfidence(tasks, workersBroken, p0Count) {
  const finished = tasks.filter((t) =>
    ["CERTIFIED_PASS", "READY_FOR_VERIFICATION", "NEEDS_FIX", "VERIFYING"].includes(
      t.status,
    ),
  );
  if (finished.length === 0) return { level: "unknown", certified_ratio: null };
  const certified = finished.filter((t) => t.status === "CERTIFIED_PASS").length;
  const ratio = certified / finished.length;
  let level = "high";
  if (ratio < 0.5) level = "low";
  else if (ratio < 0.85) level = "medium";
  if (workersBroken > 0 || p0Count > 0) level = "low";
  return {
    level,
    certified_ratio: Number(ratio.toFixed(2)),
    certified,
    finished: finished.length,
  };
}

// ---------------------------------------------------------------- markdown
export function writeLastVerified(status) {
  const ledger = readLedger();
  const recent = ledger.filter((e) => e.type === "verification").slice(-8).reverse();
  const c = status.counts;

  const lines = [
    "# Codex — Last Verified",
    "",
    `**Generated:** ${status.generated_at} · **Health:** ${status.health} · **Confidence:** ${status.confidence.level}`,
    "",
    "> Maintained automatically by the Codex verifier worker. Do not hand-edit.",
    "",
    "## System health",
    "",
    "| | |",
    "|---|---|",
    `| SYSTEM HEALTH | **${status.health}** |`,
    `| OPEN P0 | ${c.open_p0} |`,
    `| OPEN P1 | ${c.open_p1} |`,
    `| CLAUDE TASKS | ${c.claude_tasks} |`,
    `| CURSOR TASKS | ${c.cursor_tasks} |`,
    `| CODEX VERIFYING | ${c.codex_verifying} |`,
    `| AWAITING VERIFICATION | ${c.awaiting_verification} |`,
    `| BLOCKED ON MASON | ${c.blocked_on_mason} |`,
    "",
  ];

  if (status.open_p0.length || status.open_p1.length) {
    lines.push("## Open findings", "");
    for (const f of [...status.open_p0, ...status.open_p1]) {
      lines.push(`- **${f.severity} · ${f.code}** (${f.task_id}) — ${f.summary}`);
    }
    lines.push("");
  }

  if (status.blocked_on_mason.length) {
    lines.push("## Needs Mason", "");
    for (const b of status.blocked_on_mason) {
      lines.push(`- **${b.task_id}** — ${b.objective || ""}${b.reason ? ` · _${b.reason}_` : ""}`);
    }
    lines.push("");
  } else {
    lines.push("## Needs Mason", "", "_Nothing._", "");
  }

  lines.push("## Recent verifications", "");
  if (!recent.length) lines.push("_None yet._", "");
  else {
    lines.push("| when | task | verdict | worker |", "|---|---|---|---|");
    for (const r of recent) {
      lines.push(`| ${r.at} | ${r.task_id} | **${r.verdict}** | ${r.worker || "-"} |`);
    }
    lines.push("");
  }

  const broken = Object.entries(status.worker_health).filter(
    ([, w]) => w && w.available === false,
  );
  if (broken.length) {
    lines.push("## Worker health", "");
    for (const [name, w] of broken) {
      lines.push(`- ⚠️ **${name}** unavailable — ${w.reason || "unknown"}`);
    }
    lines.push("");
  }

  writeFileSync(LAST_VERIFIED_FILE, lines.join("\n"));
}

export function refreshAll(extra = {}) {
  const status = computeStatus(extra);
  writeLastVerified(status);
  return status;
}
