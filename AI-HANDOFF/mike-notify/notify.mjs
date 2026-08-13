// MIKE TASK STATUS & COMPLETION NOTIFICATION LAYER. DETERMINISTIC. NO LLM.
//
// Mike is the concierge, NOT the orchestrator. Matter owns task authority; this file
// only decides *whether to speak*, *what is true enough to say*, and *who to say it to*.
//
// Three rules drive everything here:
//   1. WHO — the recipient comes from the stored binding made at authentication time,
//      never from anything inside a message. A forwarded or quoted message cannot
//      redirect a reply.
//   2. WHAT — Mike may never say "complete", "verified" or "backed up" unless the
//      evidence level supports it. agent-reported != Matter-accepted != Codex-certified.
//   3. HOW OFTEN — one logical notification per (task, state_version, type, recipient).
//      Retrying delivery re-sends; it never creates a second notification.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEMORY = process.env.PP_NOTIFY_MEMORY === "1";
const DIR = process.env.PP_NOTIFY_DIR || HERE;
const BINDINGS = path.join(DIR, "task-bindings.json");
const NOTIFS = path.join(DIR, "notifications.jsonl");

const now = () => new Date().toISOString();
const mem = { bindings: {}, notifs: [] };

// ---------------------------------------------------------------- states
export const TASK_STATES = [
  "RECEIVED", "AUTHENTICATED", "REJECTED_UNAUTHORIZED", "ACCEPTED", "QUEUED", "ROUTED",
  "IN_PROGRESS", "WAITING_FOR_AGENT", "WAITING_FOR_CLARIFICATION", "WAITING_FOR_APPROVAL",
  "PAUSED", "BLOCKED", "PARTIALLY_COMPLETE", "VERIFYING", "COMPLETED",
  "COMPLETED_WITH_WARNINGS", "FAILED", "CANCELLED",
];
export const TERMINAL_STATES = new Set([
  "COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "CANCELLED", "REJECTED_UNAUTHORIZED",
]);
export const DELIVERY_STATES = ["PENDING", "SENDING", "SENT", "FAILED_RETRYABLE", "DEAD_LETTER"];

/**
 * Evidence ladder. Mike must never present a lower rung as a higher one.
 * An agent saying "done" is the weakest possible signal and is explicitly not completion.
 */
export const EVIDENCE_LEVEL = {
  AGENT_REPORTED: 1,   // an agent produced text / exited 0 / wrote a file
  MATTER_ACCEPTED: 2,  // Matter's acceptance criteria were met
  CODEX_CERTIFIED: 3,  // independently verified
};

/** Events that always speak, regardless of throttling. */
const BYPASS_THROTTLE = new Set([
  "accepted", "rejected_unauthorized", "clarification_required", "approval_required",
  "blocked", "verification_started", "verification_rejected", "repair_routed",
  "completed", "completed_with_warnings", "failed", "cancelled", "eod_started",
  "eod_morning_report",
]);

export const DEFAULT_CADENCE = {
  firstHeartbeatMs: 30 * 60 * 1000,   // 30 min without a meaningful update
  routineHeartbeatMs: 60 * 60 * 1000, // then at most hourly
  maxDeliveryAttempts: 5,
};

// ---------------------------------------------------------------- storage
function loadBindings() {
  if (MEMORY) return mem.bindings;
  if (!existsSync(BINDINGS)) return {};
  try { return JSON.parse(readFileSync(BINDINGS, "utf8")); } catch { return {}; }
}
function saveBindings(b) {
  if (MEMORY) { mem.bindings = b; return; }
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  writeFileSync(BINDINGS, JSON.stringify(b, null, 2) + "\n");
}
function appendNotif(rec) {
  if (MEMORY) { mem.notifs.push(rec); return; }
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  appendFileSync(NOTIFS, JSON.stringify(rec) + "\n");
}
export function allNotifications() {
  if (MEMORY) return mem.notifs.slice();
  if (!existsSync(NOTIFS)) return [];
  return readFileSync(NOTIFS, "utf8").trim().split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export const opaqueId = (v) => createHash("sha256").update(String(v), "utf8").digest("hex").slice(0, 16);

// ---------------------------------------------------------------- binding
/**
 * Bind a task to the AUTHENTICATED sender and their thread, once, at acceptance.
 * This is the only place a recipient is ever established. Everything downstream reads
 * it, so a task cannot be re-pointed at a different person by any later message.
 *
 * The raw address is stored under `address` because iMessage needs it to send; the
 * durable business record and every log line use `sender_ref` (an opaque hash).
 */
export function bindTask(input) {
  const required = ["task_id", "message_id", "sender_id", "sender_display_name", "address", "thread_id"];
  for (const k of required) if (!input[k]) throw new Error(`bindTask missing ${k}`);

  const bindings = loadBindings();
  if (bindings[input.task_id]) return bindings[input.task_id]; // idempotent

  bindings[input.task_id] = {
    task_id: input.task_id,
    run_id: input.run_id ?? null,
    message_id: input.message_id,
    correlation_id: input.correlation_id || opaqueId(`${input.task_id}:${input.message_id}`),
    sender_id: input.sender_id,
    sender_display_name: input.sender_display_name,
    sender_ref: opaqueId(input.address),   // opaque id for logs/evidence
    address: input.address,                // needed only to actually deliver
    thread_id: input.thread_id,
    channel: input.channel || "imessage",
    received_at: input.received_at || now(),
    state: "ACCEPTED",
    state_version: 1,
    assigned_agents: input.assigned_agents || [],
    approval_state: input.approval_required ? "REQUIRED" : "NOT_REQUIRED",
    evidence_level: EVIDENCE_LEVEL.AGENT_REPORTED,
    last_meaningful_status: "ACCEPTED",
    last_meaningful_at: now(),
    last_notification_at: null,
    last_routine_heartbeat_at: null,
    terminal_result: null,
    evidence_refs: [],
  };
  saveBindings(bindings);
  return bindings[input.task_id];
}

export const getBinding = (task_id) => loadBindings()[task_id] || null;

/**
 * Recipient resolution. Deliberately takes ONLY a task_id — there is no code path
 * that lets caller-supplied text influence who receives an update.
 */
export function recipientFor(task_id) {
  const b = getBinding(task_id);
  if (!b) return null;
  return { sender_id: b.sender_id, name: b.sender_display_name, address: b.address, thread_id: b.thread_id, sender_ref: b.sender_ref };
}

/**
 * Advance task state with VERSION FENCING.
 *
 * This is the Talk-to-Mike lease defect generalized: a late callback from an expired
 * lease must not mutate a newer state. A caller must present the state_version it
 * believes is current; a stale version is refused. Terminal states are frozen, so a
 * worker crash-and-retry can never turn a completed task back into a queued one.
 */
export function advanceState(task_id, { to, expectedVersion, evidenceLevel, agents, approvalState, evidenceRefs, terminalResult }) {
  if (!TASK_STATES.includes(to)) return { ok: false, code: "UNKNOWN_STATE" };
  // Codex finding `optional-state-fence`: fencing was OPTIONAL, so any caller that
  // simply omitted expectedVersion could overwrite a newer state — the exact hole the
  // fence exists to close. A caller that cannot say which version it believes is
  // current has, by definition, not read the state it is about to overwrite.
  if (expectedVersion == null)
    return { ok: false, code: "FENCE_REQUIRED",
             detail: "expectedVersion is mandatory; a caller must present the version it believes is current" };
  const bindings = loadBindings();
  const b = bindings[task_id];
  if (!b) return { ok: false, code: "UNKNOWN_TASK" };

  if (TERMINAL_STATES.has(b.state)) {
    return { ok: false, code: "TERMINAL_FROZEN", state: b.state,
             detail: `${task_id} is already ${b.state}; a late callback cannot reopen it` };
  }
  if (expectedVersion != null && expectedVersion !== b.state_version) {
    return { ok: false, code: "STALE_VERSION", state: b.state, current_version: b.state_version,
             detail: "callback presented an outdated state version" };
  }

  b.state = to;
  b.state_version += 1;
  b.last_meaningful_status = to;
  b.last_meaningful_at = now();
  if (evidenceLevel != null) b.evidence_level = evidenceLevel;
  if (agents) b.assigned_agents = agents;
  if (approvalState) b.approval_state = approvalState;
  if (evidenceRefs) b.evidence_refs = evidenceRefs;
  if (TERMINAL_STATES.has(to)) b.terminal_result = terminalResult || to;
  saveBindings(bindings);
  return { ok: true, binding: b };
}

// ---------------------------------------------------------------- idempotency
export function notificationKey({ task_id, state_version, type, recipient_id }) {
  return createHash("sha256")
    .update(`${task_id}|${state_version}|${type}|${recipient_id}`, "utf8")
    .digest("hex").slice(0, 24);
}


/**
 * In-process reservation, checked against the durable log too.
 * Single-process exclusion is enough here because one bridge worker owns delivery; the
 * PENDING row makes the reservation survive a crash so a restarted worker sees that the
 * notification was already claimed and does not send it twice.
 */
const reserved = new Set();
function reserveKey(key) {
  if (reserved.has(key)) return false;
  if (allNotifications().some((n) => n.key === key)) return false;
  reserved.add(key);
  return true;
}

// ---------------------------------------------------------------- throttling
/**
 * Should Mike speak? Returns a decision with a reason, so suppression is auditable
 * rather than silent.
 */
export function shouldNotify({ type, binding, nowMs = Date.now(), cadence = DEFAULT_CADENCE, existing = [] }) {
  if (existing.some((n) => n.key === notificationKey({
    task_id: binding.task_id, state_version: binding.state_version, type, recipient_id: binding.sender_id,
  }))) return { notify: false, reason: "duplicate_event" };

  if (BYPASS_THROTTLE.has(type)) return { notify: true, reason: "material_event" };

  if (type === "heartbeat") {
    const since = binding.last_meaningful_at ? nowMs - Date.parse(binding.last_meaningful_at) : Infinity;
    if (since < cadence.firstHeartbeatMs) return { notify: false, reason: "too_soon_after_meaningful_update" };
    const lastHb = binding.last_routine_heartbeat_at ? nowMs - Date.parse(binding.last_routine_heartbeat_at) : Infinity;
    if (lastHb < cadence.routineHeartbeatMs) return { notify: false, reason: "routine_heartbeat_throttled" };
    return { notify: true, reason: "heartbeat_due" };
  }
  return { notify: true, reason: "progress_update" };
}

// ---------------------------------------------------------------- composition
/**
 * Strip NEGATED statements before checking for overclaims.
 *
 * Without this the guard is worse than useless: it flags the honest sentences.
 * "Nothing was marked complete" and "has not been independently verified" are exactly
 * the phrasings we want Mike to use, and a naive word match suppresses them — so the
 * safety net would silently block truthful messages while teaching nobody anything.
 */
function stripNegations(message) {
  return String(message || "")
    // Order matters: the modal forms must be removed BEFORE the generic "not" rule,
    // or "could not be verified" loses its "not" first and the claim word survives.
    .replace(/\b(?:could|can|would|will|should|may|might|must)(?:\s+not|n'?t)\s+(?:yet\s+)?(?:be\s+)?\w+/gi, " ")
    .replace(/\bcannot\s+(?:be\s+)?\w+/gi, " ")
    .replace(/\b(?:has|have|was|were|is|are|had)\s+not\s+(?:yet\s+)?(?:been\s+)?\w*\s*\w*/gi, " ")
    .replace(/\bnot\s+(?:yet\s+)?(?:independently\s+)?\w+/gi, " ")
    .replace(/\bnothing\s+(?:\w+\s+){0,3}\w+/gi, " ")
    .replace(/\bno\s+(?:production\s+)?\w+\s+(?:was|were)\s+\w+/gi, " ")
    .replace(/\bnever\s+\w+/gi, " ")
    // Future/pending statements are not claims about the present.
    .replace(/\b(?:when|until|once|before)\s+(?:it\s+|that\s+)?(?:has\s+been\s+|is\s+)?(?:re[-\s]?)?\w+/gi, " ");
}

/** Words Mike may only use with the right evidence level behind them. */
const CLAIM_WORDS = /\b(complete|completed|successful|success|verified|backed up|confirmed)\b/i;

/**
 * Guard against Mike overclaiming. Any AFFIRMATIVE completion word must carry an
 * evidence level that earns it. Checked on the composed text, so a future template
 * change cannot quietly reintroduce "Done!".
 *
 * `evidenceBacked` lets a caller state an ancillary verified fact (for example a
 * backup that really was checked) without granting the task itself a higher level.
 * It is opt-in and recorded, never inferred.
 */
export function claimIsSupported(message, evidenceLevel, state, opts = {}) {
  const affirmative = stripNegations(message);
  if (!CLAIM_WORDS.test(affirmative)) return { ok: true };

  // Codex finding `claim-guard-bypass`: a caller-set boolean could wave through any
  // "verified" claim. A boolean is not evidence. An ancillary verified fact now
  // requires actual evidence references, so the bypass costs the caller something
  // checkable instead of a flag.
  const backed = Array.isArray(opts.evidenceRefs) && opts.evidenceRefs.length > 0;
  if (/\bverified\b/i.test(affirmative) &&
      evidenceLevel < EVIDENCE_LEVEL.CODEX_CERTIFIED && !backed)
    return { ok: false, reason: "says 'verified' without Codex certification or evidence references" };

  // `confirmed` and `backed up` were detected as claim words but never enforced.
  if (/\b(confirmed|backed up)\b/i.test(affirmative) &&
      evidenceLevel < EVIDENCE_LEVEL.MATTER_ACCEPTED && !backed)
    return { ok: false, reason: "claims 'confirmed'/'backed up' without accepted evidence" };

  if (/\b(complete|completed|successful|success)\b/i.test(affirmative)) {
    if (!TERMINAL_STATES.has(state)) return { ok: false, reason: "claims completion in a non-terminal state" };
    if (evidenceLevel < EVIDENCE_LEVEL.MATTER_ACCEPTED)
      return { ok: false, reason: "claims completion on agent-reported evidence alone" };
  }
  return { ok: true };
}

const verificationPhrase = (lvl) =>
  lvl >= EVIDENCE_LEVEL.CODEX_CERTIFIED ? "Codex independently verified the result."
  : lvl === EVIDENCE_LEVEL.MATTER_ACCEPTED ? "Matter accepted the result. Independent verification has not run."
  : "This is the agent's own report and has not been independently verified.";

export function composeMessage(type, binding, ctx = {}) {
  const who = binding.sender_display_name;
  const id = binding.run_id || binding.task_id;
  const title = ctx.title ? ` (${ctx.title})` : "";

  switch (type) {
    case "accepted":
      return `Received, ${who}. Task ${id}${title} was accepted and routed through Matter.${ctx.agent ? ` ${ctx.agent} is working it.` : ""} I'll text you when there's meaningful progress or if approval is needed.`;
    case "rejected_unauthorized":
      return "I can't accept that request. It couldn't be authenticated, so nothing was created or run.";
    case "clarification_required":
      return `${id} needs one thing from you before it can continue: ${ctx.question || "clarification"}. Nothing has been executed yet.`;
    case "approval_required":
      return `Approval required for ${id}: ${ctx.action || "a protected action"}. Nothing has been executed. Approve through the existing secure approval channel.`;
    case "progress":
      return `Update on ${id}: ${ctx.detail || "work is progressing"}.${ctx.remaining ? ` Still to do: ${ctx.remaining}.` : ""} No action is needed from you.`;
    case "heartbeat":
      return `${id} is still running. Current state: ${humanState(binding.state)}.${ctx.detail ? ` ${ctx.detail}` : ""} No action is needed from you.`;
    case "blocked":
      return `${id} is blocked. ${ctx.reason || "It cannot continue."}${ctx.ownerAction ? ` ${ctx.ownerAction}` : ""}`;
    case "verification_started":
      return `Update on ${id}: the work is done and Codex verification is now running. I'll tell you the outcome. No action is needed from you.`;
    case "verification_rejected":
      return `Verification found issues on ${id}: ${ctx.findings || "the result did not hold up"}. It has gone back to ${ctx.agent || "the responsible agent"} for repair. Nothing was marked complete.`;
    case "repair_routed":
      return `${id}: repair is underway with ${ctx.agent || "the responsible agent"}. I'll text you once Codex has re-checked it.`;
    case "completed":
      return `${id} is complete. ${verificationPhrase(binding.evidence_level)}${ctx.detail ? ` ${ctx.detail}` : ""}${ctx.noProdChange ? " No production data was changed." : ""}`;
    case "completed_with_warnings":
      return `${id} completed with warnings. ${ctx.detail || ""} ${verificationPhrase(binding.evidence_level)}${ctx.warnings ? ` Open warnings: ${ctx.warnings}.` : ""}`.replace(/\s+/g, " ").trim();
    case "failed":
      return `${id} failed. ${ctx.reason || "The work could not be completed."} Nothing was marked complete and no production data was changed.`;
    case "cancelled":
      return `${id} was cancelled. ${ctx.reason || ""}`.trim();
    case "eod_started":
      return `Received, ${who}. EOD safety checkpoint started. Run ID: ${id}. This will not stop active work. I'll update you when the checkpoint reaches important milestones.`;
    case "eod_progress":
      return `Update on ${id}: ${ctx.reported ?? "?"} of ${ctx.total ?? "?"} agents have synchronized.${ctx.pending ? ` ${ctx.pending} still running.` : ""} Overnight work is continuing.`;
    case "eod_morning_report":
      return `${id} ${ctx.warnings ? "completed with warnings" : "checkpoint finished"}. ${ctx.detail || ""} Overnight work is continuing. The morning report is ready.`.replace(/\s+/g, " ").trim();
    default:
      return `Update on ${id}: ${humanState(binding.state)}.`;
  }
}

const humanState = (s) => ({
  IN_PROGRESS: "in progress", WAITING_FOR_AGENT: "waiting on an agent",
  WAITING_FOR_APPROVAL: "waiting on your approval", WAITING_FOR_CLARIFICATION: "waiting on your answer",
  VERIFYING: "being independently verified", BLOCKED: "blocked",
  PARTIALLY_COMPLETE: "partially complete", PAUSED: "paused",
}[s] || String(s).toLowerCase().replace(/_/g, " "));

// ---------------------------------------------------------------- privacy
/** Nothing sensitive may leave over iMessage, whatever a template does upstream. */
const UNSAFE_OUTBOUND = [
  /sk-[A-Za-z0-9]{12,}/, /eyJ[A-Za-z0-9_-]{20,}/, /-----BEGIN/,
  /\bpassword\b|\bsecret\b|api[_-]?key|bearer /i,
  /postgres(ql)?:\/\/\S+:\S+@/,
  /\bat\s+\/[\w/.-]+:\d+:\d+/,          // stack frames
  /\bselect\s+.+\s+from\s+/i,            // raw SQL
];
export function outboundSafe(message) {
  const hits = UNSAFE_OUTBOUND.filter((re) => re.test(String(message || "")));
  return { safe: hits.length === 0, signals: hits.length };
}

// ---------------------------------------------------------------- delivery
/**
 * Emit one logical notification. Idempotent on
 * (task_id, state_version, type, recipient_id) — a retried task event produces the
 * SAME notification, and delivery retries re-send that one record rather than
 * creating another.
 */
export async function notify({ task_id, type, ctx = {}, send, nowMs = Date.now(), cadence = DEFAULT_CADENCE }) {
  const binding = getBinding(task_id);
  if (!binding) return { sent: false, code: "UNKNOWN_TASK" };

  const existing = allNotifications().filter((n) => n.task_id === task_id);
  const decision = shouldNotify({ type, binding, nowMs, cadence, existing });
  if (!decision.notify) return { sent: false, code: "SUPPRESSED", reason: decision.reason };

  const key = notificationKey({ task_id, state_version: binding.state_version, type, recipient_id: binding.sender_id });

  // Codex finding `non-atomic-idempotency`: the duplicate check and the persisted
  // record were separated by the delivery call, so two concurrent notifies with the
  // same key could BOTH send before either was recorded, and a crash after delivery
  // but before persistence lost the record entirely. Reserve the key FIRST — the
  // PENDING row is written before anything is sent, so the reservation is what makes
  // the send exclusive rather than the send making the record.
  if (!reserveKey(key)) return { sent: false, code: "SUPPRESSED", reason: "duplicate_event_concurrent" };
  appendNotif({ key, task_id, type, recipient_ref: binding.sender_ref, at: now(),
                delivery: "PENDING", state_version: binding.state_version });

  const message = composeMessage(type, binding, ctx);

  const claim = claimIsSupported(message, binding.evidence_level, binding.state, { evidenceRefs: ctx.evidenceRefs || binding.evidence_refs });
  if (!claim.ok) {
    // Refusing to send is correct. An overclaiming message is worse than silence.
    const rec = { key, task_id, type, recipient_ref: binding.sender_ref, at: now(),
                  delivery: "DEAD_LETTER", error_category: "unsupported_claim", detail: claim.reason };
    appendNotif(rec);
    return { sent: false, code: "UNSUPPORTED_CLAIM", reason: claim.reason };
  }
  const safe = outboundSafe(message);
  if (!safe.safe) {
    const rec = { key, task_id, type, recipient_ref: binding.sender_ref, at: now(),
                  delivery: "DEAD_LETTER", error_category: "unsafe_content" };
    appendNotif(rec);
    return { sent: false, code: "UNSAFE_CONTENT" };
  }

  const recipient = recipientFor(task_id);
  let delivery = "SENDING", attempts = 0, providerId = null, errorCategory = null;
  const max = cadence.maxDeliveryAttempts;
  while (attempts < max) {
    attempts += 1;
    try {
      const res = await send(recipient.address, message, { thread_id: recipient.thread_id });
      providerId = res?.providerId ?? null;
      delivery = "SENT";
      break;
    } catch (err) {
      errorCategory = classifyError(err);
      delivery = attempts >= max ? "DEAD_LETTER" : "FAILED_RETRYABLE";
      if (delivery === "DEAD_LETTER") break;
    }
  }

  // Log the OPAQUE recipient ref and never the message body — the durable business
  // record is who/what/when/outcome, not what was said.
  appendNotif({
    key, task_id, run_id: binding.run_id, correlation_id: binding.correlation_id,
    type, state: binding.state, state_version: binding.state_version,
    recipient_ref: binding.sender_ref, thread_id: binding.thread_id,
    delivery, attempts, provider_message_id: providerId, error_category: errorCategory,
    evidence_level: binding.evidence_level, at: now(),
  });

  if (delivery === "SENT") {
    const bindings = loadBindings();
    bindings[task_id].last_notification_at = now();
    if (type === "heartbeat") bindings[task_id].last_routine_heartbeat_at = now();
    saveBindings(bindings);
  }
  return { sent: delivery === "SENT", delivery, attempts, key, message, recipient_ref: binding.sender_ref };
}

function classifyError(err) {
  const m = String(err?.message || "").toLowerCase();
  if (/timeout|econn|network|offline|unreachable/.test(m)) return "transport";
  if (/not authorized|permission|automation/.test(m)) return "permission";
  return "unknown";
}

/** Re-deliver an existing notification. Never mints a new logical notification. */
export async function retryDelivery(key, send) {
  const rec = allNotifications().filter((n) => n.key === key).at(-1);
  if (!rec) return { ok: false, code: "UNKNOWN_NOTIFICATION" };
  if (rec.delivery === "SENT") return { ok: true, code: "ALREADY_SENT", duplicate: false };
  if (rec.delivery === "DEAD_LETTER") return { ok: false, code: "DEAD_LETTER" };
  const recipient = recipientFor(rec.task_id);
  try {
    const res = await send(recipient.address, "(redelivery)", { thread_id: recipient.thread_id });
    appendNotif({ ...rec, delivery: "SENT", provider_message_id: res?.providerId ?? null, at: now(), redelivery: true });
    return { ok: true, code: "SENT", duplicate: false };
  } catch {
    appendNotif({ ...rec, delivery: "FAILED_RETRYABLE", at: now(), redelivery: true });
    return { ok: false, code: "FAILED_RETRYABLE" };
  }
}

/** Distinct logical notifications for a task — the anti-spam / anti-dupe measure. */
export const logicalNotificationCount = (task_id) =>
  new Set(allNotifications().filter((n) => n.task_id === task_id).map((n) => n.key)).size;
