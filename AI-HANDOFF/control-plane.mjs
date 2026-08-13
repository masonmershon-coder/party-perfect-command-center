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
import { spawnSync } from "node:child_process";
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
  IN_PROGRESS: ["READY_FOR_VERIFICATION", "BLOCKED", "NEEDS_FIX", "WAITING_FOR_OWNER_APPROVAL"],
  READY_FOR_VERIFICATION: ["VERIFYING"], VERIFYING: ["CERTIFIED_PASS", "FAILED", "BLOCKED", "WAITING_FOR_OWNER_APPROVAL"],
  FAILED: ["NEEDS_FIX"], NEEDS_FIX: ["CLAIMED", "IN_PROGRESS", "ARCHITECTURE_REVIEW"],
  BLOCKED: ["IN_PROGRESS", "CLAIMED"], CERTIFIED_PASS: [],
  WAITING_FOR_WORKER: ["CLAIMED"],   // parked until an autonomous worker for the owner exists
  ARCHITECTURE_REVIEW: ["NEW", "CLAIMED", "WAITING_FOR_OWNER_APPROVAL"], // after 3 failed repairs — stop the loop
  WAITING_FOR_OWNER_APPROVAL: ["CLAIMED", "IN_PROGRESS", "NEW"], // consequential — Mason decides
};
// Severity (Codex assigns from evidence) + verification-status vocab (never collapse to "done").
const SEVERITY = new Set(["P0", "P1", "P2", "P3"]);
const VERIF_STATUS = new Set(["IMPLEMENTED", "TESTED", "DEPLOYED", "CONNECTED", "AUTHORITATIVELY_VERIFIED", "PHYSICALLY_VERIFIED", "FAILED", "UNVERIFIED"]);
const MAX_REPAIR_FAILURES = 3;
// Which agents currently have an autonomous runtime that can actually EXECUTE work.
// DETECTED, not asserted: a hardcoded `cursor: true` would be a false green the
// moment the runtime is uninstalled or logged out. Agents without a runtime park
// as WAITING_FOR_WORKER and are never pretend-executed.
function detectRuntime() {
  let cursor = false;
  // Official Cursor headless runtime. Presence AND a working probe. Try the PATH name and the
  // canonical install location so the probe is accurate regardless of the caller's PATH.
  const bins = [process.env.CURSOR_AGENT_BIN, "cursor-agent", `${process.env.HOME}/.local/bin/cursor-agent`].filter(Boolean);
  for (const bin of bins) {
    try {
      const probe = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15000 });
      if (!probe.error && probe.status === 0) { cursor = true; break; }
    } catch { /* try next */ }
  }
  if (!cursor && process.env.CURSOR_TRIGGER === "github") {
    // Cloud route: needs an authenticated gh able to reach the repo.
    const gh = spawnSync("gh", ["auth", "status"], { encoding: "utf8", timeout: 15000 });
    cursor = !gh.error && gh.status === 0;
  }
  // Codex autonomous worker: only "available" if a real codex CLI is on PATH. Hardcoding true
  // would be a false green the moment the CLI is absent — which is exactly today's state.
  let codex = false;
  for (const bin of [process.env.CODEX_BIN, "codex", `${process.env.HOME}/.local/bin/codex`].filter(Boolean)) {
    try { const p = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15000 }); if (!p.error && p.status === 0) { codex = true; break; } } catch { /* next */ }
  }
  // claude = this engineering session (executes by invocation, always available).
  return { claude: true, codex, cursor, mike: false, madison: false };
}
const RUNTIME = detectRuntime();
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
  "claim", "known_limitations", "unverified", "files",
  // --- Codex repair authority + shared evidence contract (spec #6, #10, #14) ---
  "severity",                        // P0..P3 — Codex assigns from impact
  "verification_status",             // IMPLEMENTED/TESTED/.../AUTHORITATIVELY_VERIFIED/... — never "done"
  "fail_count",                      // repair failures — 3 => ARCHITECTURE_REVIEW (no infinite loops)
  "original_finding",                // what Codex first observed
  "acceptance_criteria",             // what "fixed" concretely means (Codex defines)
  "reproduction_steps", "expected_behavior", "actual_behavior",
  "tests_run", "test_results", "deployment_status", "remaining_uncertainty",
  "false_green",                     // set true when a prior GREEN is disproven
  "approval_decision"];              // the single question parked for Mason

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
  if (inp.severity != null && !SEVERITY.has(inp.severity)) throw new Error(`bad severity ${inp.severity} (P0|P1|P2|P3)`);
  task.severity = inp.severity ?? null;
  if (inp.verification_status != null && !VERIF_STATUS.has(inp.verification_status)) throw new Error(`bad verification_status ${inp.verification_status}`);
  task.verification_status = inp.verification_status ?? "UNVERIFIED";
  task.fail_count = inp.fail_count ?? 0;
  task.status = "NEW";
  st.tasks[task.task_id] = task;
  saveState(st); event({ type: "create", task_id: task.task_id, by: task.created_by, status: "NEW", severity: task.severity });
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
  // WAITING_FOR_WORKER is claimable ONLY once that agent actually has a runtime,
  // otherwise a parked task could be claimed by something that cannot execute it.
  if (t.status === "WAITING_FOR_WORKER" && !RUNTIME[agent])
    throw new Error(`${agent} has no autonomous runtime — cannot claim parked ${taskId}`);
  if (!["NEW", "NEEDS_FIX", "WAITING_FOR_WORKER"].includes(t.status)) throw new Error(`cannot claim from ${t.status}`);
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
  // evidence-contract fields (spec #6) — carried on the task, no vague "fixed/done"
  for (const k of ["acceptance_criteria", "reproduction_steps", "expected_behavior", "actual_behavior",
    "tests_run", "test_results", "deployment_status", "remaining_uncertainty"])
    if (opts[k] !== undefined) t[k] = opts[k];
  if (opts.verification_status !== undefined) {
    if (!VERIF_STATUS.has(opts.verification_status)) throw new Error(`bad verification_status ${opts.verification_status}`);
    t.verification_status = opts.verification_status;
  }
  // repeated-failure counter (spec #4) — count each failed verification exactly once
  const isFailure = to === "FAILED" || (to === "NEEDS_FIX" && t.status === "VERIFYING");
  if (isFailure) t.fail_count = (t.fail_count || 0) + 1;
  if (to === "FAILED") t.verification_status = "FAILED";
  if (to === "CERTIFIED_PASS" && !opts.verification_status) t.verification_status = "AUTHORITATIVELY_VERIFIED";
  assertNoSecrets(t);
  t.status = to; t.last_updated_at = now();
  saveState(st); event({ type: "transition", task_id: taskId, by: agent, status: to, result: t.result || null, verification_status: t.verification_status, fail_count: t.fail_count || 0 });
  if (to === "CERTIFIED_PASS" || to === "FAILED")
    appendFileSync(RESULTS, JSON.stringify({ at: now(), task_id: taskId, verdict: to, by: agent, verification_status: t.verification_status, result: t.result || null, evidence: t.evidence_paths || [] }) + "\n");
  console.log(`${taskId} -> ${to} by ${agent} [${t.verification_status}]`);
  // no infinite AI loops: 3rd failed repair auto-escalates to ARCHITECTURE_REVIEW (spec #4)
  if (to === "NEEDS_FIX" && (t.fail_count || 0) >= MAX_REPAIR_FAILURES) {
    t.status = "ARCHITECTURE_REVIEW"; t.next_action = `escalated after ${t.fail_count} failed repairs — needs design review, not another retry`;
    t.last_updated_at = now(); saveState(st);
    appendFileSync(BLOCKERS, JSON.stringify({ at: now(), task_id: taskId, by: "control-plane", reason: `${t.fail_count} failed repairs`, escalate: "architecture" }) + "\n");
    event({ type: "escalate", task_id: taskId, by: "control-plane", status: "ARCHITECTURE_REVIEW", fail_count: t.fail_count });
    console.log(`${taskId} -> ARCHITECTURE_REVIEW (auto: ${t.fail_count} failed repairs)`);
  }
}

function cmdBlock(taskId, agent, reason, escalate) {
  const st = loadState(); const t = st.tasks[taskId];
  if (!t) throw new Error(`no task ${taskId}`);
  if (!(NEXT[t.status] || []).includes("BLOCKED")) throw new Error(`cannot BLOCK from ${t.status}`);
  // A verifier blocking from VERIFYING must be the assigned verifier (it may not
  // block a task it owns — that would be self-certification by another name).
  if (t.status === "VERIFYING") {
    if (agent !== t.verifier_agent) throw new Error(`only verifier (${t.verifier_agent}) may BLOCK from VERIFYING`);
    if (agent === t.owner_agent) throw new Error(`SELF-CERTIFY BLOCKED: executor cannot verify its own work`);
  }
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

// ---- Codex repair authority: FIND a defect and AUTO-ROUTE it to the responsible owner ----
// Codex is the only agent that may raise a defect. The engine (not Mason) assigns the owner
// from the subsystem, records severity + acceptance criteria + evidence, and the task enters
// NEW so the owner's deterministic dispatcher claims it. Codex stays the verifier — it does not
// implement the repair. (spec #1, #5, #6)
function cmdDefect(json, by) {
  const inp = JSON.parse(json);
  if ((by || inp.created_by) !== "codex") throw new Error("only codex may raise a defect (repair authority)");
  assertNoSecrets(inp);
  if (!inp.subsystem) throw new Error("defect requires subsystem (to auto-route the owner)");
  const owner = inp.owner_agent || ownerFor(inp.subsystem);
  if (!owner) throw new Error(`no owner mapped for subsystem ${inp.subsystem}`);
  if (owner === "codex") throw new Error("codex cannot own a defect it raised — assign another verifier if codex must fix its own infra");
  if (inp.severity && !SEVERITY.has(inp.severity)) throw new Error(`bad severity ${inp.severity}`);
  if (!inp.acceptance_criteria) throw new Error("defect requires acceptance_criteria (what 'fixed' means)");
  const st = loadState();
  const task = {}; for (const k of TASK_FIELDS) task[k] = inp[k] ?? null;
  task.task_id = inp.task_id || newId(inp.subsystem, inp.objective || "defect");
  if (st.tasks[task.task_id]) throw new Error(`task ${task.task_id} already exists`);
  task.created_at = task.last_updated_at = now();
  task.created_by = "codex";
  task.owner_agent = owner;          // auto-routed, never through Mason
  task.verifier_agent = "codex";     // Codex certifies its own finding's repair (owner≠verifier holds)
  task.severity = inp.severity || "P2";
  task.priority = inp.priority || (task.severity === "P0" ? "urgent" : "normal");
  task.risk_tier = inp.risk_tier ?? 0;
  task.approval_required = !!inp.approval_required;
  task.original_finding = inp.original_finding || inp.objective || null;
  task.verification_status = "UNVERIFIED";
  task.fail_count = 0;
  task.status = "NEW";
  assertNoSecrets(task);
  st.tasks[task.task_id] = task;
  saveState(st);
  event({ type: "defect", task_id: task.task_id, by: "codex", owner, severity: task.severity, status: "NEW" });
  console.log(`${task.task_id} DEFECT [${task.severity}] -> ${owner} (verifier: codex)`);
}

// ---- FALSE_GREEN register (spec #10): a prior GREEN that was not real. Durable + append-only. ----
function cmdFalseGreen(json, by) {
  const inp = JSON.parse(json);
  assertNoSecrets(inp);
  const rec = {
    at: now(), by: by || inp.by || "codex", task_id: inp.task_id || null, subsystem: inp.subsystem || null,
    original_claim: inp.original_claim || null, actual_truth: inp.actual_truth || null,
    why_misleading: inp.why_misleading || null, missing_verification: inp.missing_verification || null,
    prevention_rule: inp.prevention_rule || null, repair_status: inp.repair_status || "OPEN",
  };
  appendFileSync(F("FALSE_GREEN_REGISTER.jsonl"), JSON.stringify(rec) + "\n");
  // human-readable mirror
  const md = F("FALSE_GREEN_REGISTER.md");
  if (!existsSync(md)) writeFileSync(md, "# FALSE GREEN REGISTER\n\nDurable record of GREENs that were not real. Append-only via `control-plane.mjs false-green`.\n\n");
  appendFileSync(md, `\n## ${rec.at} — ${rec.task_id || "(no task)"} [${rec.subsystem || "?"}] — ${rec.repair_status}\n` +
    `- **Claimed:** ${rec.original_claim || "-"}\n- **Actual truth:** ${rec.actual_truth || "-"}\n` +
    `- **Why misleading:** ${rec.why_misleading || "-"}\n- **Missing verification:** ${rec.missing_verification || "-"}\n` +
    `- **Prevention rule:** ${rec.prevention_rule || "-"}\n- **Raised by:** ${rec.by}\n`);
  // if tied to a live task, mark it and reopen if it was certified on false pretenses
  if (inp.task_id) {
    const st = loadState(); const t = st.tasks[inp.task_id];
    if (t) { t.false_green = true; t.verification_status = "UNVERIFIED"; t.last_updated_at = now(); saveState(st);
      event({ type: "false_green", task_id: inp.task_id, by: rec.by }); }
  }
  console.log(`FALSE_GREEN recorded${inp.task_id ? " for " + inp.task_id : ""}`);
}

// ---- consequential action gate (spec #7): Codex/agents may STOP for approval but not bypass it.
// Parks the task WAITING_FOR_OWNER_APPROVAL with exactly ONE concise decision for Mason. ----
function cmdAwaitApproval(taskId, agent, decision) {
  const st = loadState(); const t = st.tasks[taskId];
  if (!t) throw new Error(`no task ${taskId}`);
  if (!(NEXT[t.status] || []).includes("WAITING_FOR_OWNER_APPROVAL")) throw new Error(`cannot await approval from ${t.status}`);
  if (!decision) throw new Error("await-approval requires the single decision to put to Mason");
  t.status = "WAITING_FOR_OWNER_APPROVAL"; t.approval_required = true; t.approval_decision = decision; t.last_updated_at = now();
  saveState(st);
  appendFileSync(BLOCKERS, JSON.stringify({ at: now(), task_id: taskId, by: agent, reason: decision, escalate: "mason", kind: "owner_approval" }) + "\n");
  event({ type: "await_approval", task_id: taskId, by: agent, status: "WAITING_FOR_OWNER_APPROVAL" });
  console.log(`${taskId} WAITING_FOR_OWNER_APPROVAL — Mason decides: ${decision}`);
}

// ---- human dashboard (spec #12) — deterministic render from state, no LLM ----
function cmdDashboard() {
  const st = loadState();
  const hb = existsSync(HEARTBEATS) ? JSON.parse(readFileSync(HEARTBEATS, "utf8")) : {};
  const tasks = Object.values(st.tasks);
  const today = now().slice(0, 10);
  const active = (t) => !["CERTIFIED_PASS"].includes(t.status);
  const openDefects = tasks.filter((t) => t.created_by === "codex" && active(t) && t.status !== "ARCHITECTURE_REVIEW");
  const bySev = (p) => openDefects.filter((t) => t.severity === p);
  const line = (t) => `| ${t.task_id} | ${t.status} | ${t.severity || "-"} | ${t.owner_agent || "-"} | ${t.verification_status || "-"} | ${(t.objective || "").slice(0, 48)} |`;
  const tbl = (rows) => rows.length ? ["| Task | Status | Sev | Owner | Verif | Objective |", "|---|---|---|---|---|---|", ...rows.map(line)].join("\n") : "_none_";
  const p0 = bySev("P0"), p1 = bySev("P1");
  const claudeT = tasks.filter((t) => t.owner_agent === "claude" && active(t));
  const cursorT = tasks.filter((t) => t.owner_agent === "cursor" && active(t));
  const verifyQ = tasks.filter((t) => t.verifier_agent === "codex" && t.status === "READY_FOR_VERIFICATION");
  const waitingOwner = tasks.filter((t) => t.status === "WAITING_FOR_OWNER_APPROVAL");
  const certifiedToday = tasks.filter((t) => t.status === "CERTIFIED_PASS" && (t.last_updated_at || "").slice(0, 10) === today);
  const failedNow = tasks.filter((t) => t.status === "FAILED" || t.verification_status === "FAILED");
  const repeated = tasks.filter((t) => (t.fail_count || 0) >= 2);
  const archReview = tasks.filter((t) => t.status === "ARCHITECTURE_REVIEW");
  const health = p0.length ? "🔴 P0 OPEN" : (failedNow.length || archReview.length) ? "🟠 ATTENTION" : waitingOwner.length ? "🟡 AWAITING OWNER" : "🟢 HEALTHY";

  const agentRows = ["claude", "codex", "cursor", "mike", "madison"].map((ag) => {
    const h = hb[ag] || {}; const rt = RUNTIME[ag] ? "yes" : "no";
    return `| ${ag} | ${h.state || "—"} | ${h.current_task || "—"} | ${rt} | ${h.last_seen || "—"} |`;
  }).join("\n");

  const md = `# AI Engineering Dashboard

_Auto-generated by \`control-plane.mjs dashboard\` from MASTER_STATE.json + HEARTBEATS.json. Do not hand-edit._
_Generated: ${now()}_

## SYSTEM HEALTH: ${health}
- Open defects: **${openDefects.length}**  ·  P0: **${p0.length}**  ·  P1: **${p1.length}**
- Codex verify queue: **${verifyQ.length}**  ·  Waiting for owner: **${waitingOwner.length}**
- Failed verifications: **${failedNow.length}**  ·  Repeated failures (≥2): **${repeated.length}**  ·  Architecture review: **${archReview.length}**
- Certified today: **${certifiedToday.length}**

## Agents
| Agent | State | Task | Runtime | Last seen |
|---|---|---|---|---|
${agentRows}

## OPEN DEFECTS (${openDefects.length})
${tbl(openDefects)}

## P0 — CRITICAL (${p0.length})
${tbl(p0)}

## P1 — HIGH (${p1.length})
${tbl(p1)}

## CLAUDE TASKS (${claudeT.length})
${tbl(claudeT)}

## CURSOR TASKS (${cursorT.length})
${tbl(cursorT)}

## CODEX VERIFY QUEUE (${verifyQ.length})
${tbl(verifyQ)}

## WAITING FOR OWNER (${waitingOwner.length})
${waitingOwner.length ? waitingOwner.map((t) => `- **${t.task_id}** — ${t.approval_decision || t.error || "decision required"}`).join("\n") : "_none_"}

## CERTIFIED TODAY (${certifiedToday.length})
${tbl(certifiedToday)}

## FAILED VERIFICATIONS (${failedNow.length})
${tbl(failedNow)}

## REPEATED FAILURES / ARCHITECTURE REVIEW (${repeated.length + archReview.length})
${tbl([...repeated, ...archReview.filter((t) => !repeated.includes(t))])}
`;
  writeFileSync(F("DASHBOARD.md"), md);
  console.log(`dashboard: ${health} — ${openDefects.length} open defects, ${verifyQ.length} to verify, ${waitingOwner.length} awaiting owner`);
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
  else if (cmd === "defect") cmdDefect(pos[0], flags.by || "codex");
  else if (cmd === "false-green") cmdFalseGreen(pos[0], flags.by);
  else if (cmd === "await-approval") cmdAwaitApproval(pos[0], pos[1], pos.slice(2).join(" ") || flags.decision);
  else if (cmd === "dashboard") cmdDashboard();
  else { console.log("usage: create|claim|transition|block|approve|heartbeat|watch|list|defect|false-green|await-approval|dashboard"); process.exit(2); }
} catch (e) { console.error("ERR:", e.message); process.exit(1); }
