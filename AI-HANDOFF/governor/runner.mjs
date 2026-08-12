// Safe execution of a PAID runtime. The only place in the system allowed to
// spawn one, and only after governor.authorizePaidCompute() says ALLOWED.
//
// Fixes the concrete failure of 2026-08-12: killing the Node dispatcher left
// cursor-agent orphaned and still spending for ~2 more minutes. The child was
// not in its own process group, so it never received the signal.
//
// Every child is now spawned detached (its own process group) and killed with
// process.kill(-pid) so the WHOLE tree dies, not just the direct child.
import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  authorizePaidCompute,
  appendLedger,
  lockPath,
  LOCK_DIR,
  activePaidRuns,
  loadPolicy,
  now,
  CODES,
} from "./governor.mjs";

/** Kill an entire process group. Returns true if we believe it is gone. */
export function killTree(pid, signal = "SIGTERM") {
  try {
    process.kill(-pid, signal); // negative pid = the whole group
    return true;
  } catch {
    try {
      process.kill(pid, signal); // fall back to the single process
      return true;
    } catch {
      return false;
    }
  }
}

export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a paid runtime under the governor.
 *
 * Returns { ran: false, code } when refused -- callers MUST treat that as a
 * hard stop, never as "proceed anyway".
 */
export async function runPaidRuntime({
  task,
  agent,
  runtime,
  bin,
  args,
  cwd,
  model = "UNKNOWN",
  reason = null,
  repairCount = 0,
}) {
  const policy = loadPolicy();
  const decision = authorizePaidCompute(task, { agent, policy, repairCount });

  if (!decision.allowed) {
    appendLedger({
      task_id: task.task_id,
      agent,
      runtime,
      model,
      status: decision.code, // e.g. BLOCKED_PAID_COMPUTE
      reason: decision.reason,
      authorized_by: null,
      result: "refused before any spend",
    });
    return { ran: false, code: decision.code, reason: decision.reason };
  }

  mkdirSync(LOCK_DIR, { recursive: true });
  const startedAt = now();
  const timeoutMs = (policy.limits?.max_runtime_seconds ?? 600) * 1000;

  // detached:true puts the child in its OWN process group so the whole tree is
  // killable. Without this, today's incident repeats.
  const child = spawn(bin, args, {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const lock = lockPath(task.task_id);
  writeFileSync(
    lock,
    JSON.stringify({
      task_id: task.task_id, agent, runtime, pid: child.pid,
      started_at: startedAt, bin, cwd,
    }),
  );

  appendLedger({
    task_id: task.task_id, agent, runtime, model,
    started_at: startedAt, status: "STARTED", retry: decision.attempt,
    reason, authorized_by: decision.authorized_by,
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => (stdout += d));
  child.stderr?.on("data", (d) => (stderr += d));

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killTree(child.pid, "SIGTERM");
    setTimeout(() => {
      if (isAlive(child.pid)) killTree(child.pid, "SIGKILL");
    }, 5000);
  }, timeoutMs);

  // If the dispatcher itself is killed, take the paid child down with us.
  const onExit = () => {
    if (child.pid && isAlive(child.pid)) killTree(child.pid, "SIGKILL");
  };
  process.on("exit", onExit);
  process.on("SIGINT", () => { onExit(); process.exit(130); });
  process.on("SIGTERM", () => { onExit(); process.exit(143); });

  const t0 = Date.now();
  const code = await new Promise((resolve) => {
    child.on("close", (c) => resolve(c));
    child.on("error", () => resolve(-1));
  });
  clearTimeout(timer);
  process.off("exit", onExit);
  rmSync(lock, { force: true });

  const durationMs = Date.now() - t0;
  const status = timedOut ? "TIMEOUT_KILLED" : code === 0 ? "COMPLETED" : "FAILED";

  appendLedger({
    task_id: task.task_id, agent, runtime, model,
    started_at: startedAt, stopped_at: now(), duration_ms: durationMs,
    status, retry: decision.attempt,
    tokens: "UNKNOWN", cost: "UNKNOWN", // never invented; runtimes do not expose it locally
    reason, authorized_by: decision.authorized_by,
    result: status === "COMPLETED" ? "exit 0" : `exit ${code}${timedOut ? " (timeout)" : ""}`,
  });

  return { ran: true, code: status, exitCode: code, stdout, stderr, durationMs, timedOut };
}

/** Emergency stop: kill every tracked paid run, whole tree each. */
export function stopAllPaidRuns(reason = "emergency stop") {
  const runs = activePaidRuns();
  const killed = [];
  for (const r of runs) {
    killTree(r.pid, "SIGTERM");
    setTimeout(() => { if (isAlive(r.pid)) killTree(r.pid, "SIGKILL"); }, 3000);
    killed.push({ task_id: r.task_id, pid: r.pid });
    appendLedger({
      task_id: r.task_id, agent: r.agent, runtime: r.runtime,
      status: "EMERGENCY_STOPPED", reason, result: `killed pid ${r.pid}`,
    });
  }
  if (existsSync(LOCK_DIR)) {
    for (const f of readdirSync(LOCK_DIR)) {
      if (!f.endsWith(".lock")) continue;
      try {
        const { pid } = JSON.parse(readFileSync(path.join(LOCK_DIR, f), "utf8"));
        if (!isAlive(pid)) rmSync(path.join(LOCK_DIR, f), { force: true });
      } catch {
        rmSync(path.join(LOCK_DIR, f), { force: true });
      }
    }
  }
  return killed;
}

export { CODES };
