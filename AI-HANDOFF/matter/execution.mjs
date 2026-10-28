#!/usr/bin/env node
// MATTER EXECUTION SUBSTRATE — durable task leases + dead-letter queue.
// DETERMINISTIC. Calls no model. Additive: does not modify control-plane.mjs.
//
// WHY THIS EXISTS: the 2026-08-17 runtime audit found 45/47 tasks untouched for >2 days,
// no leases and no DLQ. A worker that died took its task with it, and a permanently failing
// task had nowhere to go. The invariant this file enforces:
//
//     A TASK MAY NEVER BE SILENTLY ABANDONED.
//
// Every runnable unit is either: held by a live lease, back in the queue, terminal, or in the
// dead-letter queue with a reason. `reclaim()` is the sweep that makes that true even when a
// process dies without ever running again.
//
//   node execution.mjs lease <task_id> <worker_id> [--ttl=300]   claim with an expiring lease
//   node execution.mjs renew <lease_id>                          extend while genuinely working
//   node execution.mjs complete <lease_id> [--result=...]        SUCCEEDED
//   node execution.mjs fail <lease_id> --reason=... [--permanent] retryable or permanent
//   node execution.mjs reclaim                                   sweep expired leases (watchdog)
//   node execution.mjs status                                    queue + DLQ counts
//   node execution.mjs dlq                                       list dead letters
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.MATTER_EXEC_DIR || HERE;
const F = (n) => path.join(DIR, n);
const LEASES = F("LEASES.json");            // current lease state (mutable view)
const LEASE_LOG = F("LEASE_LOG.jsonl");     // append-only history (the audit record)
const DLQ = F("DEAD_LETTER.jsonl");         // append-only, permanent failures

/** The execution states required by P0-1. */
export const STATES = ["QUEUED", "LEASED", "RUNNING", "SUCCEEDED", "FAILED_RETRYABLE",
  "FAILED_PERMANENT", "DEAD_LETTER", "BLOCKED", "WAITING_APPROVAL"];
export const TERMINAL = new Set(["SUCCEEDED", "FAILED_PERMANENT", "DEAD_LETTER"]);

export const DEFAULT_TTL_SEC = Number(process.env.MATTER_LEASE_TTL || 300);
export const MAX_ATTEMPTS = Number(process.env.MATTER_MAX_ATTEMPTS || 3);

const now = () => new Date().toISOString();
const ms = (iso) => Date.parse(iso);
const readJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };
const writeJson = (f, o) => { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); };
const append = (f, o) => { mkdirSync(path.dirname(f), { recursive: true }); appendFileSync(f, JSON.stringify({ at: now(), ...o }) + "\n"); };
export const readLines = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

const load = () => readJson(LEASES, { tasks: {}, updated_at: null });
const save = (s) => { s.updated_at = now(); writeJson(LEASES, s); };

/**
 * Idempotency key for one attempt. Reclaim/retry re-uses the TASK key, so a duplicate
 * delivery or a re-run after reclaim resolves to the same unit of work rather than
 * spawning a second one.
 */
export const idempotencyKey = (task_id, attempt) =>
  createHash("sha256").update(`matter:${task_id}:${attempt}`).digest("hex").slice(0, 16);

/** Register a runnable task (idempotent — re-registering never resets attempts). */
export function enqueue(task_id, meta = {}) {
  const s = load();
  if (!s.tasks[task_id]) {
    s.tasks[task_id] = {
      task_id, state: "QUEUED", attempts: 0, lease: null,
      worker_history: [], last_error: null, artifacts: meta.artifacts || [],
      requirements: meta.requirements || null, created_at: now(), updated_at: now(),
    };
    save(s);
    append(LEASE_LOG, { event: "ENQUEUED", task_id });
  }
  return s.tasks[task_id];
}

/**
 * Claim a task with an EXPIRING lease. Refuses if a live lease is already held by someone
 * else — that is what prevents two workers doing the same work after a reclaim race.
 */
export function lease(task_id, worker_id, { ttlSec = DEFAULT_TTL_SEC } = {}) {
  const s = load();
  const t = s.tasks[task_id] || enqueue(task_id) && load().tasks[task_id];
  const cur = load().tasks[task_id];
  if (TERMINAL.has(cur.state)) throw new Error(`task ${task_id} is terminal (${cur.state})`);
  if (cur.lease && ms(cur.lease.expires_at) > Date.now() && cur.lease.worker_id !== worker_id)
    throw new Error(`task ${task_id} is leased by ${cur.lease.worker_id} until ${cur.lease.expires_at}`);
  if (["BLOCKED", "WAITING_APPROVAL"].includes(cur.state))
    throw new Error(`task ${task_id} is ${cur.state} — not eligible until released`);

  const s2 = load();
  const task = s2.tasks[task_id];
  task.attempts += 1;
  const lease_id = `L-${task_id}-${task.attempts}`;
  task.lease = {
    lease_id, worker_id,
    started_at: now(),
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    ttl_sec: ttlSec, renewals: 0,
    idempotency_key: idempotencyKey(task_id, task.attempts),
  };
  task.state = "LEASED";
  task.worker_history.push({ worker_id, attempt: task.attempts, at: now() });
  task.updated_at = now();
  save(s2);
  append(LEASE_LOG, { event: "LEASED", task_id, lease_id, worker_id, attempt: task.attempts, expires_at: task.lease.expires_at });
  return task.lease;
}

/** Mark actually-running (distinct from merely leased). */
export function running(lease_id) { return transitionByLease(lease_id, "RUNNING", { event: "RUNNING" }); }

/** Renew while genuinely working — this is what proves the worker is alive. */
export function renew(lease_id, { ttlSec = DEFAULT_TTL_SEC } = {}) {
  const s = load();
  const task = Object.values(s.tasks).find((t) => t.lease?.lease_id === lease_id);
  if (!task) throw new Error(`no live lease ${lease_id}`);
  task.lease.expires_at = new Date(Date.now() + ttlSec * 1000).toISOString();
  task.lease.renewals += 1;
  task.updated_at = now();
  save(s);
  append(LEASE_LOG, { event: "RENEWED", task_id: task.task_id, lease_id, expires_at: task.lease.expires_at });
  return task.lease;
}

function transitionByLease(lease_id, state, logExtra = {}) {
  const s = load();
  const task = Object.values(s.tasks).find((t) => t.lease?.lease_id === lease_id);
  if (!task) throw new Error(`no live lease ${lease_id}`);
  task.state = state; task.updated_at = now();
  save(s);
  append(LEASE_LOG, { task_id: task.task_id, lease_id, state, ...logExtra });
  return task;
}

export function complete(lease_id, result = null) {
  const s = load();
  const task = Object.values(s.tasks).find((t) => t.lease?.lease_id === lease_id);
  if (!task) throw new Error(`no live lease ${lease_id}`);
  task.state = "SUCCEEDED"; task.result = result; task.lease = null; task.updated_at = now();
  save(s);
  append(LEASE_LOG, { event: "SUCCEEDED", task_id: task.task_id, lease_id, result });
  return task;
}

/**
 * Fail a leased attempt. Retryable failures return the task to QUEUED until MAX_ATTEMPTS,
 * then dead-letter. Permanent failures dead-letter immediately — a permanent failure is
 * never retried, but it is never lost either.
 */
export function fail(lease_id, { reason, permanent = false } = {}) {
  const s = load();
  const task = Object.values(s.tasks).find((t) => t.lease?.lease_id === lease_id);
  if (!task) throw new Error(`no live lease ${lease_id}`);
  task.last_error = String(reason || "unspecified").slice(0, 400);
  task.lease = null;
  task.updated_at = now();
  if (permanent) { save(s); return deadLetter(task.task_id, { reason: task.last_error, kind: "FAILED_PERMANENT" }); }
  if (task.attempts >= MAX_ATTEMPTS) { save(s); return deadLetter(task.task_id, { reason: task.last_error, kind: "RETRY_LIMIT" }); }
  task.state = "FAILED_RETRYABLE";
  save(s);
  append(LEASE_LOG, { event: "FAILED_RETRYABLE", task_id: task.task_id, lease_id, attempts: task.attempts, reason: task.last_error });
  // immediately eligible again
  const s2 = load(); s2.tasks[task.task_id].state = "QUEUED"; save(s2);
  append(LEASE_LOG, { event: "REQUEUED", task_id: task.task_id, attempts: task.attempts });
  return s2.tasks[task.task_id];
}

/** Move to the dead-letter queue with everything needed to diagnose and recover. */
export function deadLetter(task_id, { reason, kind = "DEAD_LETTER", recommended = null } = {}) {
  const s = load();
  const task = s.tasks[task_id];
  if (!task) throw new Error(`unknown task ${task_id}`);
  task.state = "DEAD_LETTER"; task.lease = null; task.updated_at = now();
  save(s);
  const record = {
    task_id, kind, reason: String(reason || "").slice(0, 400),
    attempts: task.attempts, worker_history: task.worker_history,
    last_error: task.last_error, artifacts: task.artifacts,
    first_seen: task.created_at, dead_lettered_at: now(),
    recommended_recovery: recommended ||
      (kind === "RETRY_LIMIT" ? `Investigate last_error; fix cause then requeue ${task_id}`
        : "Human review required; requeue only after the permanent cause is resolved"),
  };
  append(DLQ, record);
  append(LEASE_LOG, { event: "DEAD_LETTER", task_id, kind, attempts: task.attempts });
  return record;
}

export function block(task_id, state, reason) {
  if (!["BLOCKED", "WAITING_APPROVAL"].includes(state)) throw new Error("state must be BLOCKED or WAITING_APPROVAL");
  const s = load();
  const t = s.tasks[task_id] || enqueue(task_id) && load().tasks[task_id];
  const s2 = load(); const task = s2.tasks[task_id];
  task.state = state; task.lease = null; task.blocked_reason = reason || null; task.updated_at = now();
  save(s2);
  append(LEASE_LOG, { event: state, task_id, reason });
  return task;
}

export function release(task_id) {
  const s = load(); const task = s.tasks[task_id];
  if (!task) throw new Error(`unknown task ${task_id}`);
  task.state = "QUEUED"; task.blocked_reason = null; task.updated_at = now();
  save(s); append(LEASE_LOG, { event: "RELEASED", task_id });
  return task;
}

/**
 * THE SWEEP. Any lease whose expiry has passed is reclaimed: the task returns to QUEUED, or
 * dead-letters if it has burned its attempts. This is the guarantee that a dead process
 * cannot strand work. Safe to run repeatedly; it is the watchdog's main job.
 */
export function reclaim() {
  const s = load();
  const reclaimed = [], dead = [];
  for (const task of Object.values(s.tasks)) {
    if (!task.lease) continue;
    if (ms(task.lease.expires_at) > Date.now()) continue;
    const { lease_id, worker_id } = task.lease;
    task.lease = null;
    task.last_error = `lease ${lease_id} expired (worker ${worker_id} stopped reporting)`;
    task.updated_at = now();
    if (task.attempts >= MAX_ATTEMPTS) {
      save(s);
      dead.push(deadLetter(task.task_id, { reason: task.last_error, kind: "LEASE_EXPIRED_RETRY_LIMIT" }));
    } else {
      task.state = "QUEUED";
      save(s);
      append(LEASE_LOG, { event: "LEASE_EXPIRED_RECLAIMED", task_id: task.task_id, lease_id, worker_id, attempts: task.attempts });
      reclaimed.push(task.task_id);
    }
  }
  save(load());
  return { reclaimed, dead_lettered: dead.map((d) => d.task_id) };
}

/** Counts + the oldest queue age, for the watchdog and the health page. */
export function status() {
  const s = load();
  const tasks = Object.values(s.tasks);
  const byState = {};
  for (const st of STATES) byState[st] = 0;
  let oldestQueuedMs = 0, oldestQueuedId = null;
  for (const t of tasks) {
    byState[t.state] = (byState[t.state] || 0) + 1;
    if (t.state === "QUEUED") {
      const age = Date.now() - ms(t.updated_at);
      if (age > oldestQueuedMs) { oldestQueuedMs = age; oldestQueuedId = t.task_id; }
    }
  }
  const expired = tasks.filter((t) => t.lease && ms(t.lease.expires_at) <= Date.now()).length;
  return {
    total: tasks.length, byState,
    dead_letter_count: readLines(DLQ).length,
    expired_leases_pending_reclaim: expired,
    oldest_queued_task: oldestQueuedId,
    oldest_queued_age_minutes: Math.round(oldestQueuedMs / 60000),
    // The invariant: nothing may be non-terminal, unleased, and not in a waiting state.
    abandoned: tasks.filter((t) => !t.lease && !TERMINAL.has(t.state)
      && !["QUEUED", "BLOCKED", "WAITING_APPROVAL", "FAILED_RETRYABLE"].includes(t.state)).map((t) => t.task_id),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...a] = process.argv.slice(2);
  const flags = Object.fromEntries(a.filter((x) => x.startsWith("--")).map((x) => { const [k, ...v] = x.slice(2).split("="); return [k, v.join("=") || true]; }));
  const pos = a.filter((x) => !x.startsWith("--"));
  try {
    if (cmd === "enqueue") console.log(JSON.stringify(enqueue(pos[0]), null, 2));
    else if (cmd === "lease") console.log(JSON.stringify(lease(pos[0], pos[1], { ttlSec: Number(flags.ttl || DEFAULT_TTL_SEC) }), null, 2));
    else if (cmd === "running") console.log(JSON.stringify(running(pos[0]).state));
    else if (cmd === "renew") console.log(JSON.stringify(renew(pos[0], { ttlSec: Number(flags.ttl || DEFAULT_TTL_SEC) }), null, 2));
    else if (cmd === "complete") console.log(JSON.stringify(complete(pos[0], flags.result || null).state));
    else if (cmd === "fail") console.log(JSON.stringify(fail(pos[0], { reason: flags.reason, permanent: !!flags.permanent }).state));
    else if (cmd === "block") console.log(JSON.stringify(block(pos[0], pos[1], flags.reason).state));
    else if (cmd === "release") console.log(JSON.stringify(release(pos[0]).state));
    else if (cmd === "reclaim") console.log(JSON.stringify(reclaim(), null, 2));
    else if (cmd === "status") console.log(JSON.stringify(status(), null, 2));
    else if (cmd === "dlq") for (const d of readLines(DLQ)) console.log(`${d.dead_lettered_at}  ${d.task_id.padEnd(28)} ${d.kind.padEnd(26)} attempts=${d.attempts}  ${String(d.reason).slice(0, 60)}`);
    else { console.log("usage: enqueue|lease|running|renew|complete|fail|block|release|reclaim|status|dlq"); process.exit(2); }
  } catch (e) { console.error("ERR:", e.message); process.exit(1); }
}
