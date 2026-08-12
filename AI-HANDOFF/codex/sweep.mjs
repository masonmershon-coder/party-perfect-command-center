// Periodic consistency sweep — DETERMINISTIC. No LLM calls.
//
//   node sweep.mjs daily     cheap: queue health, stale work, drift signals
//   node sweep.mjs weekly    daily + coverage/duplication/staleness checks
//
// This is the "don't re-read everything every hour" layer: it computes cheap
// signals from files already on disk. It only ever OPENS findings; it never
// certifies anything. Certification requires the verifier worker.
import { execFileSync } from "node:child_process";
import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  REPO_DIR,
  HANDOFF_DIR,
  loadTasks,
  loadJson,
  readLedger,
  upsertFindings,
  refreshAll,
  now,
  HEARTBEATS,
} from "./state.mjs";

const SWEEP_TASK = "CODEX-SWEEP";
const DAY_MS = 24 * 60 * 60 * 1000;

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: REPO_DIR, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const ageDays = (iso) => (Date.now() - Date.parse(iso || 0)) / DAY_MS;

// ------------------------------------------------------------------ daily
function dailyChecks() {
  const findings = [];
  const tasks = loadTasks();
  const ledger = readLedger();

  // 1. Verification queue not moving.
  for (const t of tasks.filter((x) => x.status === "READY_FOR_VERIFICATION")) {
    const hrs = ageDays(t.last_updated_at) * 24;
    if (hrs > 24)
      findings.push({
        severity: "P1",
        code: `stale-verification-${t.task_id.toLowerCase()}`,
        summary: `${t.task_id} has waited ${hrs.toFixed(0)}h for verification — dispatcher may not be firing`,
        evidence: "AI-HANDOFF/MASTER_STATE.json",
      });
  }

  // 2. NEEDS_FIX not being repaired.
  for (const t of tasks.filter((x) => x.status === "NEEDS_FIX")) {
    if (ageDays(t.last_updated_at) > 3)
      findings.push({
        severity: "P1",
        code: `unrepaired-${t.task_id.toLowerCase()}`,
        summary: `${t.task_id} has been NEEDS_FIX for ${ageDays(t.last_updated_at).toFixed(0)}d with no repair`,
        evidence: "AI-HANDOFF/MASTER_STATE.json",
      });
  }

  // 3. Blockers waiting on Mason.
  for (const t of tasks.filter((x) => x.status === "BLOCKED")) {
    if (ageDays(t.last_updated_at) > 5)
      findings.push({
        severity: "P2",
        code: `long-blocked-${t.task_id.toLowerCase()}`,
        summary: `${t.task_id} blocked ${ageDays(t.last_updated_at).toFixed(0)}d: ${t.error || "no reason recorded"}`,
        evidence: "AI-HANDOFF/BLOCKERS.jsonl",
      });
  }

  // 4. Critical fixes sitting on an unmerged branch.
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch && branch !== "main") {
    const ahead = git(["rev-list", "--count", "main..HEAD"]);
    if (Number(ahead) > 0)
      findings.push({
        severity: "P1",
        code: "unmerged-branch",
        summary: `${ahead} commit(s) on '${branch}' not in main — fixes are written but not deployed`,
        evidence: `git rev-list main..${branch}`,
      });
  }

  // 5. Dirty tree in files that matter.
  const dirty = git(["status", "--porcelain"])
    .split("\n")
    .filter(Boolean)
    .filter((l) => /\.(ts|tsx|mjs|ps1|sql)$/.test(l));
  if (dirty.length > 12)
    findings.push({
      severity: "P2",
      code: "large-uncommitted-surface",
      summary: `${dirty.length} uncommitted source files — unreviewed surface area`,
      evidence: "git status --porcelain",
    });

  // 6. POR sync freshness (the thing that silently goes stale).
  const snap = path.join(HANDOFF_DIR, "..", "tmp", "por-snapshot.json");
  if (existsSync(snap)) {
    const hrs = (Date.now() - statSync(snap).mtimeMs) / (60 * 60 * 1000);
    if (hrs > 6)
      findings.push({
        severity: "P1",
        code: "por-sync-stale",
        summary: `Local POR snapshot is ${hrs.toFixed(0)}h old`,
        evidence: "tmp/por-snapshot.json",
      });
  }

  // 7. Worker silence.
  const hb = loadJson(HEARTBEATS, {});
  if (hb.codex && ageDays(hb.codex.last_seen) > 2)
    findings.push({
      severity: "P1",
      code: "codex-worker-silent",
      summary: `Codex has not heartbeat in ${ageDays(hb.codex.last_seen).toFixed(0)}d`,
      evidence: "AI-HANDOFF/HEARTBEATS.json",
    });

  // 8. False greens: CERTIFIED_PASS with no ledger entry behind it.
  const certifiedIds = new Set(
    ledger.filter((e) => e.type === "verification" && e.verdict === "CERTIFIED_PASS").map((e) => e.task_id),
  );
  for (const t of tasks.filter((x) => x.status === "CERTIFIED_PASS")) {
    if (!certifiedIds.has(t.task_id))
      findings.push({
        severity: "P0",
        code: `false-green-${t.task_id.toLowerCase()}`,
        summary: `${t.task_id} is CERTIFIED_PASS but no verification exists in the ledger`,
        evidence: "AI-HANDOFF/CODEX_AUDIT_LEDGER.jsonl",
      });
  }

  return findings;
}

// ----------------------------------------------------------------- weekly
function weeklyChecks() {
  const findings = [...dailyChecks()];
  const tasks = loadTasks();

  // 9. Verification coverage: finished work that nobody ever verified.
  const unverified = tasks.filter(
    (t) => t.status === "CERTIFIED_PASS" || t.status === "READY_FOR_VERIFICATION",
  );
  const never = tasks.filter(
    (t) => !["NEW", "WAITING_FOR_WORKER"].includes(t.status) && !t.verifier_agent,
  );
  if (never.length)
    findings.push({
      severity: "P1",
      code: "missing-verifier-assignment",
      summary: `${never.length} task(s) in flight with no verifier_agent assigned`,
      evidence: "AI-HANDOFF/MASTER_STATE.json",
    });
  void unverified;

  // 10. Stale docs: reference docs older than the code they describe.
  const notes = path.join(path.dirname(REPO_DIR), "Desktop", "Party Perfect", "00 - Reference");
  if (existsSync(notes)) {
    for (const f of readdirSync(notes).filter((x) => x.endsWith(".md"))) {
      const p = path.join(notes, f);
      const days = (Date.now() - statSync(p).mtimeMs) / DAY_MS;
      if (days > 45)
        findings.push({
          severity: "P2",
          code: `stale-doc-${f.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
          summary: `${f} not touched in ${days.toFixed(0)}d — may describe code that has moved`,
          evidence: `00 - Reference/${f}`,
        });
    }
  }

  // 11. Duplicate systems: more than one dispatcher/control plane.
  const planes = readdirSync(HANDOFF_DIR).filter((f) => /dispatch|control-plane/i.test(f));
  if (planes.length > 3)
    findings.push({
      severity: "P1",
      code: "duplicate-control-planes",
      summary: `${planes.length} dispatcher/control-plane files in AI-HANDOFF — likely duplication: ${planes.join(", ")}`,
      evidence: "AI-HANDOFF/",
    });

  // 12. Secrets in tracked files (cheap regex, high value).
  const tracked = git(["ls-files"]).split("\n").filter((f) => /\.(ts|tsx|mjs|js|json|sh|ps1)$/.test(f));
  const SECRET = /(xai-[A-Za-z0-9]{16}|sk-[A-Za-z0-9]{16}|AKIA[0-9A-Z]{16}|postgres(ql)?:\/\/[^\s"']+:[^\s"']+@)/;
  for (const f of tracked.slice(0, 4000)) {
    const abs = path.join(REPO_DIR, f);
    if (!existsSync(abs) || statSync(abs).size > 512 * 1024) continue;
    let body = "";
    try {
      body = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (SECRET.test(body))
      findings.push({
        severity: "P0",
        code: `secret-in-tracked-file-${f.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
        summary: `Possible secret committed in ${f}`,
        evidence: f,
      });
  }

  return findings;
}

// ------------------------------------------------------------------- main
const kind = (process.argv[2] || "daily").toLowerCase();
if (!["daily", "weekly"].includes(kind)) {
  console.error("usage: node sweep.mjs daily|weekly");
  process.exit(2);
}

const findings = kind === "weekly" ? weeklyChecks() : dailyChecks();

// Sweep findings live under a synthetic task id so they dedupe on every run.
upsertFindings(`${SWEEP_TASK}-${kind.toUpperCase()}`, findings);
const status = refreshAll({ sweep: { kind, at: now(), findings: findings.length } });

console.log(`${kind} sweep: ${findings.length} finding(s) · health ${status.health}`);
for (const f of findings) console.log(`  ${f.severity} ${f.code} — ${f.summary}`);
