#!/usr/bin/env node
// LOCAL execution layer — DETERMINISTIC dispatcher (no LLM). Runs on the Party Perfect Mac.
// Reads the control-plane queue, and for tasks whose owner/verifier is a LOCAL worker,
// launches that worker's real runtime in an ISOLATED git worktree, with timeout+retry, and
// captures evidence. If a worker is NOT_INSTALLED it reports blocked — it never fakes work.
//
// Usage:
//   node local-dispatcher.mjs --cp=<control-plane-dir> --repo=<git-repo> \
//        --map=cursor:stub-cursor,codex:stub-codex [--max=12]
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const flags = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith("--")).map((x) => { const [k, ...v] = x.slice(2).split("="); return [k, v.join("=")]; }));
const CP_DIR = flags.cp || path.join(HERE, "..");
const REPO = flags.repo || "/Users/mikeai/grok-dashboard";
const MAX = Number(flags.max || 12);
const WT_ROOT = flags["wt-root"] || path.join(REPO, "..", ".pp-worktrees");
const MAP = Object.fromEntries((flags.map || "cursor:stub-cursor,codex:stub-codex").split(",").map((p) => p.split(":")));
const WORKERS = JSON.parse(readFileSync(path.join(HERE, "WORKERS.json"), "utf8")).workers;

const cp = (...a) => spawnSync("node", [path.join(CP_DIR, "control-plane.mjs"), ...a], { encoding: "utf8" });
const state = () => JSON.parse(readFileSync(path.join(CP_DIR, "MASTER_STATE.json"), "utf8"));
const log = (...a) => console.log("dispatch:", ...a);

function workerFor(agent) {
  const name = MAP[agent]; const w = WORKERS[name];
  if (!w) return { ok: false, why: `no worker mapped for ${agent}` };
  if (!w.launch) return { ok: false, why: `${name} has no launch command — ${w.install_owner_action || "install+auth required (owner)"}` };
  if (w.detect) { // runtime availability probe (deterministic) — no faking
    const d = w.detect.split(" ");
    const r = spawnSync(d[0], d.slice(1), { encoding: "utf8" });
    if (r.status !== 0) return { ok: false, why: `${name} runtime unavailable (\`${w.detect}\` failed) — ${w.install_owner_action || "install+auth required (owner)"}` };
  }
  return { ok: true, name, launch: w.launch };
}

function worktree(taskId) {
  const wt = path.join(WT_ROOT, taskId);
  const branch = `agent/cursor/${taskId}`;
  if (!existsSync(wt)) {
    const r = spawnSync("git", ["-C", REPO, "worktree", "add", "--quiet", "-b", branch, wt, "HEAD"], { encoding: "utf8" });
    if (r.status !== 0 && !existsSync(wt)) { log(`worktree add failed: ${(r.stderr || "").trim().slice(0, 100)}`); return null; }
    log(`isolated worktree ${branch} -> ${wt}`);
  }
  return wt;
}

function launch(agent, action, task) {
  const w = workerFor(agent);
  if (!w.ok) { log(`BLOCKED ${task.task_id} (${agent}/${action}): ${w.why}`); return "blocked"; }
  const env = { ...process.env, TASK_ID: task.task_id, ACTION: action, CP_DIR, REPO };
  if (action === "IMPLEMENT" || action === "REPAIR") { const wt = worktree(task.task_id); if (!wt) return "error"; env.WORKTREE = wt; }
  else { env.WORKTREE = path.join(WT_ROOT, task.task_id); }
  cp("heartbeat", agent, `${action}`, task.task_id);
  const parts = w.launch.split(" ");
  if (parts[0] === "node" && parts[1] && !path.isAbsolute(parts[1])) parts[1] = path.resolve(HERE, parts[1]);
  let r = spawnSync(parts[0], parts.slice(1), { encoding: "utf8", env, timeout: 60000, cwd: REPO });
  if (r.status !== 0) { log(`retry ${task.task_id} (${w.name}) after: ${(r.stderr || r.stdout || "").trim().slice(0, 80)}`); r = spawnSync(parts[0], parts.slice(1), { encoding: "utf8", env, timeout: 60000, cwd: REPO }); }
  cp("heartbeat", agent, "IDLE");
  if (r.status !== 0) { log(`ERROR ${task.task_id} (${w.name}) exit ${r.status}`); return "error"; }
  return "ran";
}

// main loop — deterministic scan for actionable local work
for (let i = 0; i < MAX; i++) {
  const tasks = Object.values(state().tasks);
  const impl = tasks.find((t) => MAP[t.owner_agent] && ["NEW", "WAITING_FOR_WORKER"].includes(t.status));
  const repair = tasks.find((t) => MAP[t.owner_agent] && t.status === "NEEDS_FIX");
  const verify = tasks.find((t) => MAP[t.verifier_agent] && t.status === "READY_FOR_VERIFICATION");
  let acted = false;
  if (impl) { const r = launch(impl.owner_agent, "IMPLEMENT", impl); acted = r === "ran"; if (r === "blocked") break; }
  else if (repair) { const r = launch(repair.owner_agent, "REPAIR", repair); acted = r === "ran"; if (r === "blocked") break; }
  else if (verify) { const r = launch(verify.verifier_agent, "VERIFY", verify); acted = r === "ran"; if (r === "blocked") break; }
  else { log("no actionable local work"); break; }
  if (!acted) break;
}
