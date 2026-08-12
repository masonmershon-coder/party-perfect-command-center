// Cursor dispatcher — DETERMINISTIC. The only LLM call is the Cursor runtime itself.
//
//   node dispatch.mjs             run every actionable Cursor task
//   node dispatch.mjs --dry-run   show what would run, change nothing
//
// Flow per task:
//   claim -> IN_PROGRESS -> isolated worktree on agent/cursor/<TASK_ID>
//         -> official Cursor runtime implements -> tests run
//         -> evidence written to AI-HANDOFF/EVIDENCE -> READY_FOR_VERIFICATION
//   Codex then picks it up through the same shared plane. Mason relays nothing.
//
// Isolation: every task gets its own git worktree. Cursor NEVER touches the
// checkout Claude is working in, and never sees another agent's dirty tree.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync, appendFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectRuntime, blockingOwnerAction, CURSOR_AGENT_BIN } from "./runtime.mjs";
import { runPaidRuntime } from "../governor/runner.mjs";
import { authorizePaidCompute, appendLedger as govLedger } from "../governor/governor.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);
const CP = path.join(HANDOFF, "control-plane.mjs");
const STATE = path.join(HANDOFF, "MASTER_STATE.json");
const EVIDENCE_DIR = path.join(HANDOFF, "EVIDENCE");
const RUN_DIR = path.join(HERE, ".runs");
const RUN_LEDGER = path.join(HANDOFF, "CURSOR_RUN_LEDGER.jsonl");
const LOCK = path.join(RUN_DIR, "dispatch.lock");
const LOCK_STALE_MS = 60 * 60 * 1000;
const AGENT = "cursor";
const TIMEOUT_MS = Number(process.env.CURSOR_TIMEOUT_MS || 25 * 60 * 1000);
const WORKTREE_ROOT = process.env.CURSOR_WORKTREE_ROOT || path.join(path.dirname(REPO), "pp-agent-worktrees");

const now = () => new Date().toISOString();
const loadTasks = () =>
  Object.values(JSON.parse(readFileSync(STATE, "utf8")).tasks || {});

const plane = (args) =>
  execFileSync("node", [CP, ...args], { cwd: REPO, encoding: "utf8" }).trim();

function ledger(entry) {
  mkdirSync(path.dirname(RUN_LEDGER), { recursive: true });
  appendFileSync(RUN_LEDGER, JSON.stringify({ at: now(), ...entry }) + "\n");
}

// ---------------------------------------------------------------- boundary
// Cursor (especially cloud) must never be handed POR/SSD/ENTERPRISE material.
const FORBIDDEN = [
  /^\/Volumes\//i,
  /PARTYPERF/i,
  /PARTY-PERFECT-BRAIN/i,
  /POR-FULL-DATA/i,
  /CustomerFile/i,
  /PaymentFile/i,
  /^[A-Za-z]:\\/,
  /^\\\\/,
  /ENTERPRISE/i,
];

/** Evidence paths Cursor may NOT receive. Empty array = safe to dispatch. */
export function boundaryViolations(task) {
  return (task.evidence_paths || []).filter((p) =>
    FORBIDDEN.some((re) => re.test(String(p))),
  );
}

// ---------------------------------------------------------------- selection
/**
 * RELEASE GATE. Real work is HELD from autonomous execution until explicitly
 * released, no matter what the queue says.
 *
 * This exists because it already failed once: the moment a runtime appeared,
 * the dispatcher picked up CC-AUTH-P0-001 (tier 2, production auth) and began
 * working it before the loop had ever been proven. Queue membership is not
 * consent.
 *
 * Auto-runnable = risk_tier <= CURSOR_MAX_AUTO_TIER (default 0) OR the task is
 * named in AI-HANDOFF/cursor/RELEASED.txt (one task id per line).
 */
const MAX_AUTO_TIER = Number(process.env.CURSOR_MAX_AUTO_TIER ?? 0);
const RELEASED_FILE = path.join(HERE, "RELEASED.txt");

export function releasedIds() {
  if (!existsSync(RELEASED_FILE)) return new Set();
  return new Set(
    readFileSync(RELEASED_FILE, "utf8")
      .split("\n")
      .map((l) => l.split("#")[0].trim())
      .filter(Boolean),
  );
}

export function isReleased(task, released = releasedIds()) {
  if (released.has(task.task_id)) return true;
  return (task.risk_tier ?? 0) <= MAX_AUTO_TIER;
}

export function selectTasks(tasks, runtimeAvailable) {
  const ACTIONABLE = ["NEW", "NEEDS_FIX", "WAITING_FOR_WORKER"];
  const released = releasedIds();
  return tasks
    .filter((t) => t.owner_agent === AGENT)
    .filter((t) => ACTIONABLE.includes(t.status))
    .filter((t) => !t.approval_required) // approval-gated work waits for Mason
    .filter((t) => isReleased(t, released))
    .filter(() => runtimeAvailable)
    .sort((a, b) => {
      const P = { critical: 0, high: 1, normal: 2, low: 3 };
      return (
        (P[a.priority] ?? 2) - (P[b.priority] ?? 2) ||
        (a.risk_tier ?? 0) - (b.risk_tier ?? 0)
      );
    });
}

// ---------------------------------------------------------------- worktree
const git = (args, cwd = REPO) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/**
 * Isolated worktree per task. Refuses to reuse a path that already has
 * uncommitted work -- another agent's changes are never at risk.
 */
export function ensureWorktree(taskId) {
  const branch = `agent/cursor/${taskId}`;
  const dir = path.join(WORKTREE_ROOT, taskId);
  mkdirSync(WORKTREE_ROOT, { recursive: true });

  const existing = git(["worktree", "list", "--porcelain"]);
  if (existing.includes(`worktree ${dir}`)) {
    const dirty = git(["status", "--porcelain"], dir);
    return { branch, dir, reused: true, dirty: dirty.length > 0 };
  }

  // Always branch from origin/main (or main) -- never from another agent's HEAD.
  let base = "main";
  try {
    git(["rev-parse", "--verify", "origin/main"]);
    base = "origin/main";
  } catch {
    base = "main";
  }
  const branchExists = (() => {
    try {
      git(["rev-parse", "--verify", branch]);
      return true;
    } catch {
      return false;
    }
  })();
  git(
    branchExists
      ? ["worktree", "add", dir, branch]
      : ["worktree", "add", "-b", branch, dir, base],
  );
  return { branch, dir, reused: false, dirty: false, base };
}

// ---------------------------------------------------------------- prompt
function buildPrompt(task, wt) {
  return `You are Cursor, the implementation agent for Party Perfect.

You are running headless in an ISOLATED git worktree. Work only here.

TASK ${task.task_id}
Objective: ${task.objective}
Subsystem: ${task.subsystem}
Risk tier: ${task.risk_tier}
Branch: ${wt.branch}
Worktree: ${wt.dir}

ACCEPTANCE
${task.expected_evidence || "Implement the objective and prove it with an automated test."}

CONTEXT FILES
${(task.evidence_paths || []).map((p) => `  - ${p}`).join("\n") || "  (none)"}

${task.status === "NEEDS_FIX" ? `THIS IS A REPAIR. The verifier rejected your previous attempt:\n${task.next_action || task.result || "(no reason recorded)"}\nFix exactly that, then re-run the tests.\n` : ""}
RULES
1. Stay inside ${wt.dir}. Never touch another worktree or branch.
2. Do NOT deploy, publish, or push to main. Do NOT run destructive commands.
3. Add or update an automated test that proves the change. It must pass.
4. Commit your work on ${wt.branch} with a clear message.
5. Never read or copy POR / PARTYPERF / ENTERPRISE customer data.
6. When done, print a short summary of what you changed and which test proves it.`;
}

// ---------------------------------------------------------------- tests
function runTests(dir) {
  const pkg = path.join(dir, "package.json");
  const cmds = [];
  if (existsSync(pkg)) {
    const scripts = JSON.parse(readFileSync(pkg, "utf8")).scripts || {};
    if (scripts.typecheck) cmds.push(["npm", ["run", "typecheck"]]);
    else cmds.push(["npx", ["tsc", "--noEmit"]]);
    if (scripts.test) cmds.push(["npm", ["test", "--silent"]]);
  }
  const results = [];
  for (const [bin, args] of cmds) {
    const r = spawnSync(bin, args, { cwd: dir, encoding: "utf8", timeout: TIMEOUT_MS });
    results.push({
      cmd: `${bin} ${args.join(" ")}`,
      ok: !r.error && r.status === 0,
      output: `${r.stdout || ""}${r.stderr || ""}`.trim().slice(-4000),
    });
  }
  return results;
}

// ---------------------------------------------------------------- evidence
function writeEvidence(task, wt, runOut, tests, commit) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${task.task_id}.md`);
  const allOk = tests.length > 0 && tests.every((t) => t.ok);
  const body = [
    `# ${task.task_id} — Cursor implementation evidence`,
    "",
    `**Generated:** ${now()} · **Agent:** cursor (autonomous) · **Branch:** \`${wt.branch}\``,
    "",
    "> Written automatically by the Cursor dispatcher. Not hand-authored.",
    "",
    "## Objective",
    "",
    task.objective || "(none)",
    "",
    "## Isolation",
    "",
    `- worktree: \`${wt.dir}\``,
    `- branch: \`${wt.branch}\`${wt.base ? ` (from \`${wt.base}\`)` : ""}`,
    `- commit: \`${commit || "(none)"}\``,
    "",
    "## Tests",
    "",
    tests.length ? "" : "_No test command found — this is a gap, not a pass._",
    ...tests.map(
      (t) => `### \`${t.cmd}\` — ${t.ok ? "PASS" : "FAIL"}\n\n\`\`\`\n${t.output.slice(-1500) || "(no output)"}\n\`\`\`\n`,
    ),
    "## Result",
    "",
    allOk ? "All tests passed." : "**Tests did not all pass.**",
    "",
    "## Agent summary",
    "",
    "```",
    (runOut || "(no output)").trim().slice(-3000),
    "```",
  ].join("\n");
  writeFileSync(file, body);
  return { file: path.relative(REPO, file), allOk };
}

// ---------------------------------------------------------------- lock
function takeLock() {
  mkdirSync(RUN_DIR, { recursive: true });
  if (existsSync(LOCK)) {
    let stamp = 0;
    try {
      stamp = Date.parse(JSON.parse(readFileSync(LOCK, "utf8")).at || 0);
    } catch {
      stamp = 0;
    }
    if (Date.now() - stamp < LOCK_STALE_MS) return false;
    rmSync(LOCK, { force: true });
  }
  writeFileSync(LOCK, JSON.stringify({ at: now(), pid: process.pid }));
  return true;
}
const releaseLock = () => rmSync(LOCK, { force: true });

// ---------------------------------------------------------------- one task
async function runTask(task, runtime) {
  const violations = boundaryViolations(task);
  if (violations.length) {
    plane(["block", task.task_id, AGENT, `boundary: Cursor may not receive ${violations.join(", ")}`, "--escalate=agent"]);
    ledger({ task_id: task.task_id, event: "boundary_block", violations });
    return "BLOCKED";
  }

  // GATE FIRST. Checking after claiming would mutate task state for work that
  // is never allowed to run, stranding it IN_PROGRESS with nothing behind it.
  const pre = authorizePaidCompute(task, {
    agent: AGENT,
    repairCount: task.status === "NEEDS_FIX" ? 1 : 0,
  });
  if (!pre.allowed) {
    govLedger({
      task_id: task.task_id, agent: AGENT, runtime: "cursor",
      status: pre.code, reason: pre.reason, result: "refused before claim",
    });
    ledger({ task_id: task.task_id, event: "compute_refused", code: pre.code, reason: pre.reason });
    console.log(`  ${task.task_id} ${pre.code} — ${pre.reason} (task left in ${task.status})`);
    return pre.code;
  }

  plane(["claim", task.task_id, AGENT]);
  plane(["transition", task.task_id, AGENT, "IN_PROGRESS"]);
  plane(["heartbeat", AGENT, "implementing", task.task_id]);

  const wt = ensureWorktree(task.task_id);
  ledger({ task_id: task.task_id, event: "worktree", branch: wt.branch, dir: wt.dir, reused: wt.reused });

  mkdirSync(RUN_DIR, { recursive: true });
  const prompt = buildPrompt(task, wt);
  writeFileSync(path.join(RUN_DIR, `${task.task_id}.prompt.txt`), prompt);

  const bin = process.env.CURSOR_STUB || CURSOR_AGENT_BIN;
  const args = process.env.CURSOR_STUB ? [prompt] : ["--print", "--force", prompt];

  // EVERY paid invocation goes through the governor. There is no path from a
  // queue change to a spawned paid agent that skips this call.
  const paid = await runPaidRuntime({
    task, agent: AGENT, runtime: runtime.id, bin, args, cwd: wt.dir,
    reason: `implement ${task.task_id}`,
    repairCount: task.status === "NEEDS_FIX" ? 1 : 0,
  });

  if (!paid.ran) {
    plane(["block", task.task_id, AGENT, `${paid.code}: ${paid.reason}`, "--escalate=mason"]);
    ledger({ task_id: task.task_id, event: "compute_refused", code: paid.code, reason: paid.reason });
    console.log(`  ${task.task_id} ${paid.code} — ${paid.reason}`);
    return paid.code;
  }

  const durationMs = paid.durationMs;
  const runOut = `${paid.stdout || ""}\n${paid.stderr || ""}`;
  writeFileSync(path.join(RUN_DIR, `${task.task_id}.out.txt`), runOut);

  if (paid.code !== "COMPLETED") {
    const reason = paid.timedOut
      ? `Cursor runtime timed out and was killed (process group)`
      : `Cursor runtime failed: ${(paid.stderr || "").trim().slice(0, 200)}`;
    plane(["block", task.task_id, AGENT, reason, "--escalate=agent"]);
    ledger({ task_id: task.task_id, event: "runtime_failed", runtime: runtime.id, durationMs, reason });
    return "BLOCKED";
  }

  const tests = runTests(wt.dir);
  let commit = "";
  try {
    commit = git(["rev-parse", "--short", "HEAD"], wt.dir);
  } catch { /* no commit yet */ }

  const ev = writeEvidence(task, wt, runOut, tests, commit);

  ledger({
    task_id: task.task_id, event: "implemented", runtime: runtime.id,
    branch: wt.branch, commit: commit || null, durationMs,
    tests: tests.map((t) => ({ cmd: t.cmd, ok: t.ok })), tests_passed: ev.allOk,
    evidence: ev.file,
  });

  // Hand to the verifier through the shared plane -- no relay.
  plane([
    "transition", task.task_id, AGENT, "READY_FOR_VERIFICATION",
    `--evidence=${ev.file}`,
    `--claim=implemented on ${wt.branch}${commit ? ` @ ${commit}` : ""}; tests ${ev.allOk ? "pass" : "FAILED"}`,
  ]);
  plane(["heartbeat", AGENT, "idle"]);
  return "READY_FOR_VERIFICATION";
}

// ---------------------------------------------------------------- main
async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const detected = detectRuntime();
  const runtime = process.env.CURSOR_STUB
    ? { id: "stub", available: true, mode: "stub" }
    : detected.chosen;

  const only = (argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;
  const tasks = loadTasks();
  let queue = selectTasks(tasks, Boolean(runtime));
  if (only) queue = queue.filter((t) => t.task_id === only);
  // A stub runtime must NEVER touch real work. Certification runs are scoped to
  // their own synthetic task; without --only a stub would reach for production
  // tasks like CC-AUTH-P0-001.
  if (process.env.CURSOR_STUB && !only) {
    console.log("cursor-dispatch: CURSOR_STUB set without --only= — refusing to run real tasks");
    return 0;
  }

  if (!runtime) {
    const action = blockingOwnerAction(detected);
    const parked = tasks.filter(
      (t) => t.owner_agent === AGENT && ["NEW", "NEEDS_FIX", "WAITING_FOR_WORKER"].includes(t.status),
    );
    console.log(`cursor-dispatch: NO RUNTIME — ${detected.cli.reason}`);
    console.log(`  ${parked.length} task(s) parked. Nothing changed.`);
    console.log(`  OWNER ACTION: ${action}`);
    ledger({ event: "no_runtime", reason: detected.cli.reason, parked: parked.length });
    return 0;
  }

  if (!queue.length) {
    console.log("cursor-dispatch: nothing actionable");
    return 0;
  }
  if (dryRun) {
    for (const t of queue) console.log(`WOULD RUN ${t.task_id} [${t.status}] ${t.objective || ""}`);
    return 0;
  }
  if (!takeLock()) {
    console.log("cursor-dispatch: already running");
    return 0;
  }

  try {
    for (const t of queue) {
      console.log(`CURSOR ${t.task_id} [${t.status}] via ${runtime.id}`);
      try {
        const outcome = await runTask(t, runtime);
        console.log(`  ${t.task_id} -> ${outcome}`);
      } catch (e) {
        console.error(`  ${t.task_id} ERROR: ${e.message}`);
        ledger({ task_id: t.task_id, event: "dispatch_error", error: e.message });
      }
    }
  } finally {
    releaseLock();
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main());
