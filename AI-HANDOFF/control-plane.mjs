#!/usr/bin/env node
// Party Perfect AI control plane — DETERMINISTIC task/evidence system.
// No LLM. No secrets. Claude + Codex + Cursor coordinate through files here so Mason
// is never the message bus. Routing, status transitions, ownership, dedupe, timestamps,
// locking, and audit are all deterministic code (spec rule #8).
//
// Files (this dir): MASTER_STATE.json (authoritative current state) · TASK_QUEUE.jsonl
// (append-only event log = audit) · RESULTS.jsonl · BLOCKERS.jsonl · APPROVALS.jsonl ·
// HEARTBEATS.json · EVIDENCE/. Markdown files are human-readable only.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const F = (n) => path.join(DIR, n);
const STATE = F("MASTER_STATE.json"), QUEUE = F("TASK_QUEUE.jsonl"), RESULTS = F("RESULTS.jsonl"),
  BLOCKERS = F("BLOCKERS.jsonl"), APPROVALS = F("APPROVALS.jsonl"), HEARTBEATS = F("HEARTBEATS.json");
if (!existsSync(F("EVIDENCE"))) mkdirSync(F("EVIDENCE"), { recursive: true });

// ---- clock (deterministic-friendly: honor SOURCE_DATE_EPOCH if set) ----
const now = () => (process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000) : new Date()).toISOString();

// ---- ownership (deterministic routing, spec #5) ----
const SUBSYSTEM_OWNER = {
  por: "claude", enterprise: "claude", counter: "claude", rds: "claude", crystal: "claude",
  printer: "claude", bridge: "claude", observer: "claude", legacy: "claude",
  product: "cursor", frontend: "cursor", backend: "cursor", api: "cursor", "command-center": "cursor",
  audit: "codex", verification: "codex", certification: "codex", security: "codex", regression: "codex",
};
const ownerFor = (subsystem) => SUBSYSTEM_OWNER[String(subsystem || "").toLowerCase()] || null;

// ---- lifecycle (spec #2) ----
const NEXT = {
  NEW: ["CLAIMED", "WAITING_FOR_WORKER"], CLAIMED: ["IN_PROGRESS", "NEW"],
  IN_PROGRESS: ["READY_FOR_VERIFICATION", "BLOCKED", "NEEDS_FIX"],
  READY_FOR_VERIFICATION: ["VERIFYING"], VERIFYING: ["CERTIFIED_PASS", "FAILED"],
  FAILED: ["NEEDS_FIX"], NEEDS_FIX: ["CLAIMED", "IN_PROGRESS"],
  BLOCKED: ["IN_PROGRESS", "CLAIMED"], CERTIFIED_PASS: [],
  WAITING_FOR_WORKER: ["CLAIMED"],   // parked until an autonomous worker for the owner exists
};
// Which agents currently have an autonomous runtime that can actually EXECUTE work.
// Cursor has none yet -> its tasks park as WAITING_FOR_WORKER (never pretend-executed).
const RUNTIME = { claude: true, codex: true, cursor: false, mike: false, madison: false };
// which agent may drive which transition
const OWNER_MOVES = new Set(["IN_PROGRESS", "READY_FOR_VERIFICATION", "BLOCKED", "NEEDS_FIX_RECLAIM"]);
const VERIFIER_MOVES = new Set(["VERIFYING", "CERTIFIED_PASS", "FAILED", "NEEDS_FIX"]);

// ---- secret guard (spec #17): never allow secret VALUES in task records ----
const SECRET_RE = /(postgres(ql)?:\/\/|DATABASE_URL\s*=|xai-[A-Za-z0-9]{16}|sk-[A-Za-z0-9]{16}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{20}|password\s*[:=]\s*\S{4}|OWNER_PIN\s*=|AUTH_PASSWORD\s*=)/i;
function assertNoSecrets(obj) {
  const s = JSON.stringify(obj);
  if (SECRET_RE.test(s)) throw new Error("REJECTED: task record contains a secret value. Use secret_store references only.");
}

// ---- state io ----
const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { tasks: {}, updatedAt: null });
function saveState(st) { st.updatedAt = now(); writeFileSync(STATE, JSON.stringify(st, null, 2)); }
function event(ev) { appendFileSync(QUEUE, JSON.stringify({ at: now(), ...ev }) + "\n"); } // append-only audit

const TASK_FIELDS = ["task_id", "created_at", "created_by", "owner_agent", "verifier_agent", "subsystem",
  "objective", "priority", "risk_tier", "dependencies", "approval_required", "status",
  "expected_evidence", "evidence_paths", "result", "error", "next_action", "last_updated_at",
  "claim", "known_limitations", "unverified", "files"];

function newId(subsystem, objective) {
  const h = createHash("sha1").update(`${subsystem}:${objective}:${now()}`).digest("hex").slice(0, 6).toUpperCase();
  return `${String(subsystem || "TASK").toUpperCase()}-${h}`;
}

// ---- commands ----
function cmdCreate(json) {
  const inp = JSON.parse(json);
  assertNoSecrets(inp);
  const st = loadState();
  const subsystem = inp.subsystem || "task";
  const task = {};
  for (const k of TASK_FIELDS) task[k] = inp[k] ?? null;
  task.task_id = inp.task_id || newId(subsystem, inp.objective || "");
  if (st.tasks[task.task_id]) throw new Error(`task ${task.task_id} already exists`);
  task.created_at = now(); task.last_updated_at = now();
  task.created_by = inp.created_by || "unknown";
  task.subsystem = subsystem;
  task.owner_agent = inp.owner_agent || ownerFor(subsystem);
  task.verifier_agent = inp.verifier_agent || "codex";
  task.priority = inp.priority || "normal";
  task.risk_tier = inp.risk_tier ?? 0;
  task.approval_required = !!inp.approval_required;
  task.status = "NEW";
  st.tasks[task.task_id] = task;
  saveState(st); event({ type: "create", task_id: task.task_id, by: task.created_by, status: "NEW" });
  console.log(task.task_id);
}

function lockConflict(st, task, agent) {
  // subsystem/file lock: another agent holds an ACTIVE task on the same subsystem
  const active = ["CLAIMED", "IN_PROGRESS"];
  for (const t of Object.values(st.tasks)) {
    if (t.task_id === task.task_id) continue;
    if (t.owner_agent && t.owner_agent !== agent && active.includes(t.status)) {
      const sameSub = t.subsystem === task.subsystem;
      const sameFile = (t.files || []).some((f) => (task.files || []).includes(f));
      if (sameFile) return `file lock held by ${t.owner_agent} on ${t.task_id}`;
      if (sameSub && (t.files || []).length === 0 && (task.files || []).length === 0) return null; // subsystem alone doesn't hard-block
    }
  }
  return null;
}

function cmdClaim(taskId, agent) {
  const st = loadState(); const t = st.tasks[taskId];
  if (!t) throw new Error(`no task ${taskId}`);
  const owner = t.owner_agent || ownerFor(t.subsystem);
  if (owner && owner !== agent) throw new Error(`ownership: ${taskId} belongs to ${owner}, not ${agent}`);
  if (!["NEW", "NEEDS_FIX"].includes(t.status)) throw new Error(`cannot claim from ${t.status}`);
  const conflict = lockConflict(st, t, agent); if (conflict) throw new Error(`LOCK: ${conflict}`);
  t.owner_agent = agent; t.status = "CLAIMED"; t.last_updated_at = now();
  saveState(st); event({ type: "claim", task_id: taskId, by: agent, status: "CLAIMED" });
  console.log(`${taskId} CLAIMED by ${agent}`);
}

function cmdTransition(taskId, agent, to, opts) {
  const st = loadState(); const t = st.tasks[taskId];
  if (!t) throw new Error(`no task ${taskId}`);
  if (!(NEXT[t.status] || []).includes(to)) throw new Error(`illegal transition ${t.status} -> ${to}`);
  // authority
  const ownerSide = ["IN_PROGRESS", "READY_FOR_VERIFICATION", "BLOCKED"].includes(to) || (t.status === "NEEDS_FIX");
  const verifierSide = VERIFIER_MOVES.has(to);
  if (verifierSide) {
    if (agent !== t.verifier_agent) throw new Error(`only verifier (${t.verifier_agent}) may set ${to}`);
    if (agent === t.owner_agent) throw new Error(`SELF-CERTIFY BLOCKED: executor cannot verify its own work`);
  } else if (ownerSide) {
    if (agent !== t.owner_agent) throw new Error(`only owner (${t.owner_agent}) may set ${to}`);
  }
  if (opts.result !== undefined) t.result = opts.result;
  if (opts.error !== undefined) t.error = opts.error;
  if (opts.evidence) t.evidence_paths = [...(t.evidence_paths || []), ...opts.evidence.split(",")];
  if (opts.next) t.next_action = opts.next;
  if (opts.claim) t.claim = opts.claim;
  if (opts.unverified) t.unverified = opts.unverified.split(",");
  assertNoSecrets(t);
  t.status = to; t.last_updated_at = now();
  saveState(st); event({ type: "transition", task_id: taskId, by: agent, status: to, result: t.result || null });
  if (to === "CERTIFIED_PASS" || to === "FAILED")
    appendFileSync(RESULTS, JSON.stringify({ at: now(), task_id: taskId, verdict: to, by: agent, result: t.result || null, evidence: t.evidence_paths || [] }) + "\n");
  console.log(`${taskId} -> ${to} by ${agent}`);
}

function cmdBlock(taskId, agent, reason, escalate) {
  const st = loadState(); const t = st.tasks[taskId];
  if (!t) throw new Error(`no task ${taskId}`);
  if (!(NEXT[t.status] || []).includes("BLOCKED")) throw new Error(`cannot BLOCK from ${t.status}`);
  t.status = "BLOCKED"; t.error = reason; t.last_updated_at = now();
  const OWNER_ONLY = ["login", "2fa", "password", "physical", "business-rule", "approval", "vendor"];
  const toMason = OWNER_ONLY.some((k) => (escalate || "").toLowerCase().includes(k)) || escalate === "mason";
  saveState(st);
  appendFileSync(BLOCKERS, JSON.stringify({ at: now(), task_id: taskId, by: agent, reason, escalate: toMason ? "mason" : (escalate || "agent") }) + "\n");
  event({ type: "block", task_id: taskId, by: agent, status: "BLOCKED", escalate: toMason ? "mason" : "agent" });
  console.log(`${taskId} BLOCKED (${toMason ? "escalate:mason" : "route:agent"})`);
}

function cmdApprove(taskId, by, scope) {
  const st = loadState(); const t = st.tasks[taskId];
  if (!t) throw new Error(`no task ${taskId}`);
  appendFileSync(APPROVALS, JSON.stringify({ at: now(), task_id: taskId, by, scope }) + "\n");
  t.approval_required = false; t.last_updated_at = now(); saveState(st);
  event({ type: "approve", task_id: taskId, by, scope });
  console.log(`${taskId} approved by ${by} (${scope})`);
}

function cmdHeartbeat(agent, state, taskId, blocked) {
  const hb = existsSync(HEARTBEATS) ? JSON.parse(readFileSync(HEARTBEATS, "utf8")) : {};
  hb[agent] = { current_task: taskId || null, state, blocked_reason: blocked || null, last_seen: now() };
  writeFileSync(HEARTBEATS, JSON.stringify(hb, null, 2));
  console.log(`heartbeat ${agent}: ${state}${taskId ? " " + taskId : ""}`);
}

// Park a task whose owner has no autonomous runtime (e.g. cursor) as WAITING_FOR_WORKER.
function cmdPark(taskId) {
  const st = loadState(); const t = st.tasks[taskId];
  if (!t) throw new Error(`no task ${taskId}`);
  if (RUNTIME[t.owner_agent]) throw new Error(`${t.owner_agent} has a runtime — do not park; let it run`);
  if (!(NEXT[t.status] || []).includes("WAITING_FOR_WORKER")) throw new Error(`cannot park from ${t.status}`);
  t.status = "WAITING_FOR_WORKER"; t.last_updated_at = now();
  saveState(st); event({ type: "park", task_id: taskId, status: "WAITING_FOR_WORKER", owner: t.owner_agent });
  console.log(`${taskId} WAITING_FOR_WORKER (no autonomous ${t.owner_agent} runtime yet)`);
}

// what does THIS agent need to act on? (deterministic — the cheap watcher's brain)
function cmdWatch(agent) {
  const st = loadState(); const actionable = [];
  for (const t of Object.values(st.tasks)) {
    if (t.status === "WAITING_FOR_WORKER") continue; // parked — not actionable until a worker exists
    if (t.status === "NEW" && (t.owner_agent === agent || ownerFor(t.subsystem) === agent)) actionable.push([t, "CLAIM"]);
    else if (t.status === "NEEDS_FIX" && t.owner_agent === agent) actionable.push([t, "REPAIR"]);
    else if (t.status === "READY_FOR_VERIFICATION" && t.verifier_agent === agent) actionable.push([t, "VERIFY"]);
    else if (t.status === "CLAIMED" && t.owner_agent === agent) actionable.push([t, "START"]);
    else if (t.status === "IN_PROGRESS" && t.owner_agent === agent) actionable.push([t, "CONTINUE"]);
  }
  if (!actionable.length) { console.log(`${agent}: no actionable tasks`); return; }
  console.log(`${agent} actionable:`);
  for (const [t, action] of actionable) console.log(`  ${action}  ${t.task_id}  [${t.status}] ${t.objective || ""}`);
}

function cmdList() {
  const st = loadState();
  const rows = Object.values(st.tasks).sort((a, b) => (a.task_id < b.task_id ? -1 : 1));
  for (const t of rows) console.log(`${t.task_id}  ${t.status.padEnd(22)} own:${t.owner_agent || "-"} ver:${t.verifier_agent || "-"} tier:${t.risk_tier}  ${t.objective || ""}`);
  if (!rows.length) console.log("(no tasks)");
}

// ---- dispatch ----
const [cmd, ...a] = process.argv.slice(2);
const flags = Object.fromEntries(a.filter((x) => x.startsWith("--")).map((x) => { const [k, ...v] = x.slice(2).split("="); return [k, v.join("=")]; }));
const pos = a.filter((x) => !x.startsWith("--"));
try {
  if (cmd === "create") cmdCreate(pos[0]);
  else if (cmd === "claim") cmdClaim(pos[0], pos[1]);
  else if (cmd === "transition") cmdTransition(pos[0], pos[1], pos[2], flags);
  else if (cmd === "park") cmdPark(pos[0]);
  else if (cmd === "block") cmdBlock(pos[0], pos[1], pos.slice(2).join(" "), flags.escalate);
  else if (cmd === "approve") cmdApprove(pos[0], pos[1], pos.slice(2).join(" "));
  else if (cmd === "heartbeat") cmdHeartbeat(pos[0], pos[1], pos[2], pos.slice(3).join(" "));
  else if (cmd === "watch") cmdWatch(pos[0]);
  else if (cmd === "list") cmdList();
  else { console.log("usage: create|claim|transition|block|approve|heartbeat|watch|list"); process.exit(2); }
} catch (e) { console.error("ERR:", e.message); process.exit(1); }
