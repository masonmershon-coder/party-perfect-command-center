// "Codex, everything good?" — answers from maintained state. No LLM, no scan.
//
//   node status.mjs           the six-line board
//   node status.mjs --full    plus what changed, what failed, what needs Mason
//   node status.mjs --json    machine-readable (for the dashboard)
import { refreshAll, readLedger, loadFindings } from "./state.mjs";

const BOARD = (s) => {
  const c = s.counts;
  return [
    `SYSTEM HEALTH: ${s.health}`,
    `OPEN P0: ${c.open_p0}`,
    `OPEN P1: ${c.open_p1}`,
    `CLAUDE TASKS: ${c.claude_tasks}`,
    `CURSOR TASKS: ${c.cursor_tasks}`,
    `CODEX VERIFYING: ${c.codex_verifying}`,
    `BLOCKED ON MASON: ${c.blocked_on_mason}`,
  ].join("\n");
};

function full(s) {
  const ledger = readLedger();
  const verifications = ledger.filter((e) => e.type === "verification");
  const recent = verifications.slice(-5).reverse();
  const out = [BOARD(s), ""];

  out.push("WHAT CHANGED");
  if (!recent.length) out.push("  nothing verified yet");
  for (const r of recent)
    out.push(`  ${r.verdict.padEnd(15)} ${r.task_id}  ${r.summary || ""}`.trimEnd());

  const failed = verifications.filter((r) => r.verdict === "NEEDS_FIX").slice(-5).reverse();
  out.push("", "WHAT FAILED");
  if (!failed.length) out.push("  nothing outstanding");
  for (const r of failed) out.push(`  ${r.task_id}  ${r.summary || ""}`);

  const findings = loadFindings().findings.filter((f) => ["P0", "P1"].includes(f.severity));
  out.push("", "STILL NEEDS ATTENTION");
  if (!findings.length) out.push("  no open P0/P1");
  for (const f of findings)
    out.push(`  ${f.severity} ${f.code} (${f.task_id}) — ${f.summary}`);

  out.push("", "NEEDS MASON");
  if (!s.blocked_on_mason.length) out.push("  nothing");
  for (const b of s.blocked_on_mason)
    out.push(`  ${b.task_id} — ${b.reason || b.objective || ""}`);

  const broken = Object.entries(s.worker_health).filter(([, w]) => w && w.available === false);
  if (broken.length) {
    out.push("", "WORKER HEALTH");
    for (const [name, w] of broken) out.push(`  ${name} UNAVAILABLE — ${w.reason}`);
  }

  out.push(
    "",
    `confidence: ${s.confidence.level}` +
      (s.confidence.certified_ratio != null
        ? ` (${s.confidence.certified}/${s.confidence.finished} certified)`
        : ""),
    `last verified: ${s.last_verified_at || "never"}`,
  );
  if (s.last_sweep) out.push(`last sweep: ${s.last_sweep.kind} @ ${s.last_sweep.at}`);
  return out.join("\n");
}

const argv = process.argv.slice(2);
const status = refreshAll();
if (argv.includes("--json")) console.log(JSON.stringify(status, null, 2));
else if (argv.includes("--full")) console.log(full(status));
else console.log(BOARD(status));
