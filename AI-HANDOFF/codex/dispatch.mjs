// Codex dispatcher — DETERMINISTIC. No LLM in this file.
//
// Fired by launchd WatchPaths on MASTER_STATE.json (event-driven, not polling).
// Selects tasks that are genuinely ready for Codex, routes each to a worker
// class, and runs them one at a time. Then refreshes Mason-facing state.
//
//   node dispatch.mjs              run every eligible task
//   node dispatch.mjs --dry-run    show what would run, change nothing
//   node dispatch.mjs --worker=codex-local   only this worker class
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTasks, refreshAll, appendLedger, RUN_DIR, now } from "./state.mjs";
import { requiredWorker } from "./verify.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCK = path.join(RUN_DIR, "dispatch.lock");
const LOCK_STALE_MS = 30 * 60 * 1000;

/** Which worker classes can run on THIS machine. */
function localCapabilities() {
  const caps = new Set(["codex-cloud"]); // a checkout is always reachable
  if (process.platform === "darwin" || process.env.CODEX_FORCE_LOCAL === "1")
    caps.add("codex-local");
  return caps;
}

/** Tasks a verifier should pick up, in priority order. Pure function. */
export function selectTasks(tasks, caps, workerFilter) {
  const PRIORITY = { critical: 0, high: 1, normal: 2, low: 3 };
  return tasks
    .filter((t) => t.status === "READY_FOR_VERIFICATION")
    .filter((t) => t.verifier_agent === "codex")
    .filter((t) => t.owner_agent !== "codex") // never self-certify
    .map((t) => ({ task: t, worker: requiredWorker(t) }))
    .filter(({ worker }) => (workerFilter ? worker === workerFilter : true))
    .filter(({ worker }) => caps.has(worker))
    .sort((a, b) => {
      const p =
        (PRIORITY[a.task.priority] ?? 2) - (PRIORITY[b.task.priority] ?? 2);
      if (p !== 0) return p;
      const r = (a.task.risk_tier ?? 0) - (b.task.risk_tier ?? 0);
      if (r !== 0) return r;
      return String(a.task.last_updated_at).localeCompare(String(b.task.last_updated_at));
    });
}

/** Tasks that want a worker class this machine cannot provide. */
export function unroutable(tasks, caps) {
  return tasks
    .filter((t) => t.status === "READY_FOR_VERIFICATION" && t.verifier_agent === "codex")
    .map((t) => ({ task: t, worker: requiredWorker(t) }))
    .filter(({ worker }) => !caps.has(worker));
}

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
    rmSync(LOCK, { force: true }); // stale -- previous run died
  }
  writeFileSync(LOCK, JSON.stringify({ at: now(), pid: process.pid }));
  return true;
}

const releaseLock = () => rmSync(LOCK, { force: true });

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const workerFilter = (argv.find((a) => a.startsWith("--worker=")) || "").split("=")[1] || null;

  const caps = localCapabilities();
  const tasks = loadTasks();
  const queue = selectTasks(tasks, caps, workerFilter);
  const skipped = unroutable(tasks, caps);

  for (const { task, worker } of skipped) {
    console.log(`SKIP ${task.task_id} needs ${worker}, not available here`);
  }

  if (!queue.length) {
    console.log("no tasks ready for codex");
    if (!dryRun) refreshAll();
    return 0;
  }

  if (dryRun) {
    for (const { task, worker } of queue)
      console.log(`WOULD VERIFY ${task.task_id} [${worker}] ${task.objective || ""}`);
    return 0;
  }

  if (!takeLock()) {
    console.log("dispatch already running -- exiting");
    return 0;
  }

  let failures = 0;
  try {
    for (const { task, worker } of queue) {
      console.log(`VERIFY ${task.task_id} [${worker}]`);
      appendLedger({ type: "dispatch", task_id: task.task_id, worker });
      try {
        execFileSync("node", [path.join(HERE, "verify.mjs"), task.task_id], {
          stdio: "inherit",
        });
      } catch {
        // verify.mjs already recorded BLOCKED/NEEDS_FIX and exits non-zero on
        // any non-pass. Keep going so one bad task cannot stall the queue.
        failures += 1;
      }
    }
  } finally {
    releaseLock();
  }

  const status = refreshAll();
  console.log(
    `dispatch done: ${queue.length} task(s), ${failures} not certified · health ${status.health}`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
