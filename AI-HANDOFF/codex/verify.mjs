// Codex verifier worker — runs ONE task end to end.
//
//   node verify.mjs <TASK_ID>
//
// Flow: READY_FOR_VERIFICATION -> VERIFYING -> CERTIFIED_PASS | NEEDS_FIX | BLOCKED
//
// The only LLM call in the whole system happens here, and only for a task that
// a deterministic dispatcher already selected. Everything else -- selection,
// routing, transitions, state -- is plain code.
//
// HARD RULE: if the Codex CLI is missing or fails, the task goes BLOCKED with
// the real reason. It never becomes a pass. A verifier that cannot run must
// never look like a verifier that ran and approved.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  HANDOFF_DIR,
  REPO_DIR,
  RUN_DIR,
  loadTasks,
  appendLedger,
  upsertFindings,
  clearFindings,
  refreshAll,
  now,
} from "./state.mjs";

const CONTROL_PLANE = path.join(HANDOFF_DIR, "control-plane.mjs");
const CODEX_BIN = process.env.CODEX_BIN || "codex";
const AGENT = "codex";
const TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 15 * 60 * 1000);

// ------------------------------------------------------------- capability
/**
 * Which worker class can verify this task?
 *
 *   codex-local  evidence lives on this Mac -- SSD, ENTERPRISE-adjacent files,
 *                local-only repos, local test runs
 *   codex-cloud  everything reachable from a checkout + the public internet
 *
 * Deterministic on purpose: cloud Codex must never be handed local-only
 * evidence and asked to pretend.
 */
export function requiredWorker(task) {
  const paths = task.evidence_paths || [];
  // Anchored to real local filesystem roots. Deliberately NOT a loose brand
  // match: /PARTYPERF/i also matches the public host "partyperfect.app", which
  // would route a cloud-verifiable URL to a local-only worker.
  const localSignals = [
    /^\/Volumes\//i,
    /^\/Users\//i,
    /^\/private\//i,
    /^[A-Za-z]:\\/, // ENTERPRISE (Windows) paths
    /^\\\\/, // UNC share
  ];
  const needsLocal = paths.some((p) => {
    const raw = String(p).split("#")[0].trim();
    if (/^https?:\/\//i.test(raw)) return false; // reachable from anywhere
    return localSignals.some((re) => re.test(raw));
  });
  if (needsLocal) return "codex-local";
  if (/enterprise|counter|crystal|printer|rds|legacy/i.test(String(task.subsystem || "")))
    return "codex-local";
  return "codex-cloud";
}

/** Evidence that the task references but that does not exist on this machine. */
export function missingEvidence(task) {
  return (task.evidence_paths || []).filter((p) => {
    const raw = String(p).split("#")[0];
    if (!raw) return false;
    if (/^https?:\/\//i.test(raw)) return false; // remote, not our job to resolve
    const abs = path.isAbsolute(raw) ? raw : path.join(REPO_DIR, raw);
    const alt = path.isAbsolute(raw)
      ? null
      : path.join(path.dirname(REPO_DIR), "Desktop", "Party Perfect", raw);
    return !existsSync(abs) && !(alt && existsSync(alt));
  });
}

// ------------------------------------------------------------- plane calls
function plane(args) {
  return execFileSync("node", [CONTROL_PLANE, ...args], {
    cwd: REPO_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function transition(taskId, to, opts = {}) {
  const args = ["transition", taskId, AGENT, to];
  for (const [k, v] of Object.entries(opts)) {
    if (v != null && v !== "") args.push(`--${k}=${String(v).replace(/\n/g, " ")}`);
  }
  return plane(args);
}

// ------------------------------------------------------------- prompt
function buildPrompt(task, worker) {
  return `You are Codex, the INDEPENDENT VERIFIER for Party Perfect.

You did not do this work. Your job is to try to break the claim, not to agree
with it. Default to NEEDS_FIX when the evidence does not actually establish the
claim. Approving something unproven is the worst outcome available to you.

TASK ${task.task_id}
Objective: ${task.objective || "(none stated)"}
Owner (who did the work): ${task.owner_agent}
Subsystem: ${task.subsystem}
Risk tier: ${task.risk_tier}
Worker class: ${worker}

CLAIM TO VERIFY
${task.claim || "(no explicit claim recorded -- treat the objective as the claim)"}

EXPECTED EVIDENCE
${task.expected_evidence || "(none stated)"}

ACCEPTANCE CRITERIA
${task.acceptance_criteria || "(none stated -- the claim must hold exactly as written)"}

EVIDENCE PATHS (read these; do not go hunting beyond what is needed)
${(task.evidence_paths || []).map((p) => `  - ${p}`).join("\n") || "  (none listed)"}

ALREADY FLAGGED AS UNVERIFIED BY THE OWNER
${(task.unverified || []).map((u) => `  - ${u}`).join("\n") || "  (none)"}

RULES
1. Read only the task record, the evidence above, and source/runtime needed to
   check it.
2. Re-derive the numbers yourself. Do not restate the owner's arithmetic.
3. Changing nothing is correct. You are read-only.
4. If evidence is missing or unreachable, that is BLOCKED, not a pass.
5. If the claim is right but incomplete, that is NEEDS_FIX with findings.

OUTPUT
Print exactly one JSON object as the LAST thing you output, nothing after it:

{"verdict":"CERTIFIED_PASS"|"NEEDS_FIX"|"BLOCKED",
 "summary":"one sentence a busy owner can act on",
 "findings":[{"severity":"P0"|"P1"|"P2","code":"short-kebab-code","summary":"...","evidence":"file:line or path"}],
 "checked":["what you actually re-derived"],
 "blocked_reason":"only when verdict is BLOCKED"}

findings must be [] for CERTIFIED_PASS.`;
}

// ------------------------------------------------------------- codex call
function codexAvailable() {
  const probe = spawnSync(CODEX_BIN, ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    return {
      available: false,
      reason:
        probe.error?.code === "ENOENT"
          ? `Codex CLI not found on PATH (looked for "${CODEX_BIN}")`
          : `Codex CLI probe failed: ${(probe.stderr || "").trim() || probe.status}`,
    };
  }
  return { available: true, version: (probe.stdout || "").trim() };
}

function runCodex(prompt, taskId) {
  mkdirSync(RUN_DIR, { recursive: true });
  const promptFile = path.join(RUN_DIR, `${taskId}.prompt.txt`);
  const outFile = path.join(RUN_DIR, `${taskId}.out.txt`);
  writeFileSync(promptFile, prompt);

  // exec: non-interactive, read-only sandbox, never auto-approve writes.
  const args = process.env.CODEX_ARGS
    ? process.env.CODEX_ARGS.split(" ").filter(Boolean)
    : ["exec", "--sandbox", "read-only", "--skip-git-repo-check"];

  const res = spawnSync(CODEX_BIN, [...args, prompt], {
    cwd: REPO_DIR,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });

  const stdout = res.stdout || "";
  writeFileSync(outFile, `${stdout}\n--- stderr ---\n${res.stderr || ""}`);

  if (res.error) {
    if (res.error.code === "ETIMEDOUT")
      return { ok: false, reason: `Codex timed out after ${TIMEOUT_MS}ms`, outFile };
    return { ok: false, reason: `Codex failed: ${res.error.message}`, outFile };
  }
  if (res.status !== 0)
    return {
      ok: false,
      reason: `Codex exited ${res.status}: ${(res.stderr || "").trim().slice(0, 300)}`,
      outFile,
    };
  return { ok: true, stdout, outFile };
}

/** Last complete JSON object in the output. Codex narrates before it answers. */
export function parseVerdict(stdout) {
  const matches = [...String(stdout).matchAll(/\{[\s\S]*?\}(?=[^{]*$)/g)];
  const candidates = [];
  for (let i = stdout.length; i >= 0; i--) {
    const start = stdout.lastIndexOf("{", i);
    if (start < 0) break;
    const slice = stdout.slice(start);
    try {
      const parsed = JSON.parse(slice.slice(0, slice.lastIndexOf("}") + 1));
      if (parsed && typeof parsed.verdict === "string") candidates.push(parsed);
    } catch {
      /* keep walking left */
    }
    i = start;
  }
  void matches;
  const found = candidates[0];
  if (!found) return null;
  const verdict = String(found.verdict).toUpperCase();
  if (!["CERTIFIED_PASS", "NEEDS_FIX", "BLOCKED"].includes(verdict)) return null;
  return {
    verdict,
    summary: found.summary || "",
    findings: Array.isArray(found.findings) ? found.findings : [],
    checked: Array.isArray(found.checked) ? found.checked : [],
    blocked_reason: found.blocked_reason || "",
  };
}

// ------------------------------------------------------------- main
function fail(taskId, reason, worker) {
  try {
    plane(["block", taskId, AGENT, reason, "--escalate=agent"]);
  } catch (e) {
    console.error(`could not BLOCK ${taskId}: ${e.message}`);
  }
  appendLedger({ type: "verification", task_id: taskId, verdict: "BLOCKED", worker, reason });
  refreshAll();
  console.log(`${taskId} BLOCKED: ${reason}`);
}

export function verifyTask(taskId) {
  const task = loadTasks().find((t) => t.task_id === taskId);
  if (!task) throw new Error(`no task ${taskId}`);
  if (task.status !== "READY_FOR_VERIFICATION")
    throw new Error(`${taskId} is ${task.status}, not READY_FOR_VERIFICATION`);
  if (task.verifier_agent !== AGENT)
    throw new Error(`${taskId} verifier is ${task.verifier_agent}, not ${AGENT}`);
  if (task.owner_agent === AGENT)
    throw new Error(`SELF-CERTIFY BLOCKED: ${taskId} is owned by codex`);

  const worker = requiredWorker(task);
  const started = now();

  // Claim it first so a concurrent dispatch cannot double-run it.
  transition(taskId, "VERIFYING");
  plane(["heartbeat", AGENT, "verifying", taskId]);

  const missing = missingEvidence(task);
  if (missing.length) {
    fail(taskId, `evidence unreachable from ${worker}: ${missing.join(", ")}`, worker);
    return "BLOCKED";
  }

  const probe = codexAvailable();
  if (!probe.available) {
    refreshAll({ worker_health: { [worker]: { available: false, reason: probe.reason, checked_at: now() } } });
    fail(taskId, probe.reason, worker);
    return "BLOCKED";
  }

  const run = runCodex(buildPrompt(task, worker), taskId);
  if (!run.ok) {
    fail(taskId, run.reason, worker);
    return "BLOCKED";
  }

  const parsed = parseVerdict(run.stdout);
  if (!parsed) {
    fail(taskId, `Codex returned no parseable verdict (see ${path.relative(REPO_DIR, run.outFile)})`, worker);
    return "BLOCKED";
  }

  const evidenceRef = path.relative(REPO_DIR, run.outFile);

  if (parsed.verdict === "CERTIFIED_PASS") {
    clearFindings(taskId);
    transition(taskId, "CERTIFIED_PASS", { result: parsed.summary, evidence: evidenceRef });
  } else if (parsed.verdict === "NEEDS_FIX") {
    upsertFindings(taskId, parsed.findings);
    // FAILED then NEEDS_FIX -- NEEDS_FIX is what routes it back to the owner.
    transition(taskId, "FAILED", { result: parsed.summary, evidence: evidenceRef });
    transition(taskId, "NEEDS_FIX", { next: parsed.summary });
  } else {
    fail(taskId, parsed.blocked_reason || parsed.summary || "Codex reported BLOCKED", worker);
    return "BLOCKED";
  }

  appendLedger({
    type: "verification",
    task_id: taskId,
    verdict: parsed.verdict,
    worker,
    started_at: started,
    summary: parsed.summary,
    findings: parsed.findings.length,
    checked: parsed.checked,
    evidence: evidenceRef,
    codex_version: probe.version || null,
  });

  refreshAll({ worker_health: { [worker]: { available: true, version: probe.version, checked_at: now() } } });
  plane(["heartbeat", AGENT, "idle"]);
  console.log(`${taskId} -> ${parsed.verdict}`);
  return parsed.verdict;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const taskId = process.argv[2];
  if (!taskId) {
    console.error("usage: node verify.mjs <TASK_ID>");
    process.exit(2);
  }
  try {
    const verdict = verifyTask(taskId);
    process.exit(verdict === "CERTIFIED_PASS" ? 0 : 1);
  } catch (e) {
    console.error("ERR:", e.message);
    process.exit(1);
  }
}
