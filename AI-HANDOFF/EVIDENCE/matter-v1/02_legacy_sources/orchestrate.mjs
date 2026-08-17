#!/usr/bin/env node
// MATTER — orchestrator / project manager. DETERMINISTIC. Calls no model.
//
//   node orchestrate.mjs            one pass: advance chains, dispatch workers
//   node orchestrate.mjs --plan     show what it would do, change nothing
//   node orchestrate.mjs --board    the owner view
//
// Matter reacts to control-plane state. It routes and advances; it never
// invents a business rule, never makes a protected decision, never bypasses an
// approval gate, and never writes code.
//
// PARALLEL BY DEFAULT: workers for different roles are launched concurrently.
// A task only waits when it genuinely depends on another task.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);
const CP = path.join(HANDOFF, "control-plane.mjs");
const STATE = path.join(HANDOFF, "MASTER_STATE.json");
const HEARTBEATS = path.join(HANDOFF, "HEARTBEATS.json");
const EVENTS = path.join(HANDOFF, "MATTER_EVENTS.jsonl");

const now = () => new Date().toISOString();
const argv = process.argv.slice(2);
const plan = argv.includes("--plan");

const load = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };
const tasks = () => Object.values(load(STATE, { tasks: {} }).tasks || {});

function event(e) {
  mkdirSync(path.dirname(EVENTS), { recursive: true });
  appendFileSync(EVENTS, JSON.stringify({ at: now(), ...e }) + "\n");
}

const cp = (args) => {
  try { return { ok: true, out: execFileSync("node", [CP, ...args], { cwd: REPO, encoding: "utf8" }).trim() }; }
  catch (e) { return { ok: false, out: (e.stderr || e.message || "").trim() }; }
};

// ---------------------------------------------------------------- dependencies
/**
 * A task is READY when every task it depends on has reached CERTIFIED_PASS.
 * `dependencies` already exists on the task record; nothing used it until now.
 */
function unmetDependencies(task, byId) {
  const deps = Array.isArray(task.dependencies) ? task.dependencies
    : (typeof task.dependencies === "string" && task.dependencies ? [task.dependencies] : []);
  return deps.filter((d) => (byId[d]?.status || "MISSING") !== "CERTIFIED_PASS");
}

// ---------------------------------------------------------------- workers
// One worker per role. Matter starts them; it does not do their work.
const WORKERS = {
  cursor: { cmd: ["node", path.join(HANDOFF, "cursor", "dispatch.mjs")], handles: (t) => t.owner_agent === "cursor" },
  codex:  { cmd: ["node", path.join(HANDOFF, "codex", "dispatch.mjs")],  handles: (t) => t.verifier_agent === "codex" && t.status === "READY_FOR_VERIFICATION" },
};

/** Launch role workers concurrently — unrelated work must never serialize. */
function dispatchParallel(roles) {
  return Promise.all(roles.map((r) => new Promise((resolve) => {
    const w = WORKERS[r];
    if (!w) return resolve({ role: r, skipped: true });
    execFile(w.cmd[0], w.cmd.slice(1), { cwd: REPO, timeout: 20 * 60 * 1000 }, (err, stdout, stderr) => {
      resolve({ role: r, ok: !err, out: (stdout || "").trim().split("\n").slice(-4).join(" · "), err: err ? (stderr || err.message).slice(0, 160) : null });
    });
  })));
}

// ---------------------------------------------------------------- heartbeats
const STALE_MIN = 90;
function heartbeatHealth() {
  const hb = load(HEARTBEATS, {});
  const out = {};
  for (const [agent, v] of Object.entries(hb)) {
    const ageMin = v.last_seen ? (Date.now() - Date.parse(v.last_seen)) / 60000 : null;
    let status = v.state || "UNKNOWN";
    if (ageMin == null) status = "OFFLINE";
    else if (ageMin > STALE_MIN) status = "STALE";
    out[agent] = { status, current_task: v.current_task || null, age_min: ageMin == null ? null : Math.round(ageMin) };
  }
  return out;
}

// ---------------------------------------------------------------- advance
function advance() {
  const all = tasks();
  const byId = Object.fromEntries(all.map((t) => [t.task_id, t]));
  const actions = [];

  for (const t of all) {
    // FAILED -> NEEDS_FIX: route a rejection back to the implementer, always.
    if (t.status === "FAILED") {
      actions.push({ kind: "route_failure", task: t.task_id, to: t.owner_agent,
        do: () => cp(["transition", t.task_id, t.verifier_agent || "codex", "NEEDS_FIX", `--next=verifier rejected: ${(t.result || "see evidence").slice(0, 120)}`]) });
    }

    // Recover blockers whose CAUSE is gone. A task blocked because a runtime
    // was missing should not stay blocked forever once that runtime exists —
    // otherwise stale blockers silently accumulate and look like real ones.
    if (t.status === "BLOCKED" && /not found on PATH|not installed|CLI not found/i.test(t.error || "")) {
      const runtimeBack =
        (/codex/i.test(t.error || "") && existsSync("/opt/homebrew/bin/codex")) ||
        (/cursor/i.test(t.error || "") && existsSync(`${process.env.HOME}/.local/bin/cursor-agent`));
      if (runtimeBack) {
        actions.push({ kind: "recover_blocked", task: t.task_id, do: () => {
          const st = load(STATE, { tasks: {} });
          const x = st.tasks[t.task_id];
          x.status = x.verifier_agent && x.claim ? "READY_FOR_VERIFICATION" : "NEW";
          x.error = null; x.last_updated_at = now();
          writeFileSync(STATE, JSON.stringify(st, null, 2));
          return { ok: true, out: `requeued as ${x.status} (runtime is back)` };
        }});
      }
    }

    // Dependency gate: surface blocked-by-dependency rather than letting a task
    // sit in NEW looking actionable.
    if (["NEW", "NEEDS_FIX"].includes(t.status)) {
      const unmet = unmetDependencies(t, byId);
      if (unmet.length) actions.push({ kind: "waiting_on_dependency", task: t.task_id, unmet, do: null });
    }

    // Approval-gated work never auto-runs.
    if (t.approval_required && !t.approval_granted && !["CERTIFIED_PASS", "BLOCKED"].includes(t.status)) {
      actions.push({ kind: "needs_owner", task: t.task_id, do: null });
    }
  }
  return actions;
}

// ---------------------------------------------------------------- board
function board() {
  const all = tasks();
  const hb = heartbeatHealth();
  const byId = Object.fromEntries(all.map((t) => [t.task_id, t]));
  const active = (agent) => all.filter((t) => t.owner_agent === agent && ["CLAIMED", "IN_PROGRESS"].includes(t.status));
  const queued = (agent) => all.filter((t) => t.owner_agent === agent && ["NEW", "NEEDS_FIX", "WAITING_FOR_WORKER"].includes(t.status) && !unmetDependencies(t, byId).length);
  const verifying = all.filter((t) => t.status === "VERIFYING");
  const awaitingVerify = all.filter((t) => t.status === "READY_FOR_VERIFICATION");
  const blocked = all.filter((t) => t.status === "BLOCKED");
  const needsMason = all.filter((t) => t.approval_required && !t.approval_granted && t.status !== "CERTIFIED_PASS");
  const done = all.filter((t) => t.status === "CERTIFIED_PASS");

  // POR replication freshness — the parity loop depends on it.
  let sync = "UNKNOWN";
  const rs = load("/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/17-MIGRATION-LOGS/replication-state.json", null);
  if (rs?.last_success) {
    const h = (Date.now() - Date.parse(rs.last_success)) / 3600000;
    sync = h < 1 ? `FRESH (${h.toFixed(1)}h)` : h < 24 ? `STALE (${h.toFixed(0)}h)` : `VERY STALE (${(h / 24).toFixed(0)}d)`;
  } else sync = "NEVER — replication has not run";

  const line = (a) => {
    const w = active(a)[0];
    const q = queued(a).length;
    const h = hb[a]?.status || "OFFLINE";
    return `${w ? `working ${w.task_id}` : q ? `${q} queued` : "idle"}  [${h}]`;
  };

  console.log("================= PARTY PERFECT — TODAY =================");
  console.log(`CLAUDE    ${line("claude")}`);
  console.log(`CURSOR    ${line("cursor")}`);
  console.log(`CODEX     ${verifying.length ? `verifying ${verifying[0].task_id}` : `${awaitingVerify.length} awaiting`}  [${hb.codex?.status || "OFFLINE"}]`);
  console.log(`MIKE      ${line("mike")}`);
  console.log(`MADISON   ${line("madison")}`);
  console.log("");
  console.log(`POR SYNC  ${sync}`);
  console.log(`DONE      ${done.length} certified`);
  console.log("");
  if (blocked.length) {
    console.log("BLOCKED");
    for (const b of blocked.slice(0, 6)) console.log(`  ${b.task_id} — ${(b.error || "").slice(0, 70)}`);
    console.log("");
  }
  console.log("NEEDS MASON");
  if (!needsMason.length) console.log("  nothing");
  for (const m of needsMason) console.log(`  ${m.task_id} — ${(m.objective || "").slice(0, 74)}`);
  console.log("=========================================================");
}

// ---------------------------------------------------------------- main
if (argv.includes("--board")) { board(); process.exit(0); }

const actions = advance();
const auto = actions.filter((a) => a.do);
const surfaced = actions.filter((a) => !a.do);

if (plan) {
  for (const a of actions) console.log(`  ${a.kind.padEnd(24)} ${a.task}${a.unmet ? ` (waiting on ${a.unmet.join(", ")})` : ""}`);
  console.log(`\n  ${auto.length} automatic · ${surfaced.length} surfaced`);
  process.exit(0);
}

for (const a of auto) {
  const r = a.do();
  event({ action: a.kind, task: a.task, ok: r.ok, detail: r.out.slice(0, 200) });
  console.log(`${a.kind}: ${a.task} — ${r.ok ? "done" : "no-op (" + r.out.slice(0, 60) + ")"}`);
}

// Roles run CONCURRENTLY. Cursor implementing must not wait on Codex verifying.
const results = await dispatchParallel(["cursor", "codex"]);
for (const r of results) console.log(`worker ${r.role}: ${r.ok ? r.out || "nothing to do" : "ERR " + r.err}`);

event({ action: "pass_complete", auto: auto.length, surfaced: surfaced.length, workers: results.map((r) => r.role) });
console.log("");
board();
