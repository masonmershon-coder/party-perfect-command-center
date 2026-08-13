// MIKE COMMAND ROUTING — authenticated iMessage -> Matter task -> notification layer.
//
// This is the piece that was missing when Mason texted a QuickBooks question and got
// "Ops brain wiring in progress". Transport was healthy; nothing connected it to Matter.
//
// ORDER OF OPERATIONS MATTERS:
//   authenticate -> classify -> create durable task -> bind sender/thread -> acknowledge
// The acknowledgement comes LAST of those, because acknowledging before the task is
// durable is how Mason ends up holding a Task ID that nothing is working.
//
// Mike stays the concierge. Every consequential decision — acceptance criteria,
// approval requirements, terminal disposition — belongs to Matter and the existing
// control plane. Authorized identity lets Mike ACCEPT an instruction; it is never an
// authorization bypass.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIntent } from "./intent.mjs";
import { authorizeSender, hashHandle } from "../eod/trigger.mjs";
import { bindTask, notify, advanceState, getBinding } from "../mike-notify/notify.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);
const CONTROL_PLANE = path.join(HANDOFF, "control-plane.mjs");

/** Deterministic task id from the message event — one message, one task, forever. */
export function taskIdFor({ messageRowId, senderHandle }) {
  const h = hashHandle(senderHandle).slice(0, 6).toUpperCase();
  return `MIKE-${messageRowId}-${h}`;
}

/**
 * Protected domains. A request landing here is created but held: Matter requires owner
 * approval before anything consequential runs. Mike relays the request; it cannot grant it.
 */
const APPROVAL_REQUIRED_DOMAINS = new Set(["por"]);

function createMatterTask(input, exec = execFileSync) {
  try {
    exec("node", [CONTROL_PLANE, "create", JSON.stringify(input)],
      { cwd: REPO, encoding: "utf8", timeout: 30000 });
    return { ok: true, created: true };
  } catch (err) {
    const msg = String(err.message || "");
    // Idempotent: a redelivered iMessage resolves to the same task id, and the second
    // create is expected to collide. That is success, not failure.
    if (/already exists/.test(msg)) return { ok: true, created: false };
    return { ok: false, error: msg.slice(0, 200) };
  }
}

/**
 * Handle one authenticated inbound message.
 *
 * @param message { text, senderHandle, messageRowId } — senderHandle from the bridge's
 *                authenticated handle join, NEVER from the message body.
 * @param config  bridge.config.json (AUTHORIZED list)
 * @param io      { send, exec }
 * @returns null when Mike should stay out of the way (caller falls through).
 */
export async function routeMessage(message, config = {}, io = {}) {
  const { send, exec = execFileSync } = io;

  // 1 — authenticate. Identity is never derived from message text.
  const auth = authorizeSender(message.senderHandle, config);
  if (!auth.authorized) {
    // Reveal nothing about internal state to an unauthenticated sender.
    return { handled: true, created: false, code: "UNAUTHORIZED",
             reply: "I can't accept requests from this number." };
  }

  // 2 — classify. No magic syntax required, and no guessing allowed.
  const intent = classifyIntent(message.text);

  if (intent.kind === "smalltalk")
    return { handled: true, created: false, code: "SMALLTALK", reply: `Hi ${auth.name}. Send me a question whenever you're ready.` };

  if (intent.kind === "refused")
    return { handled: true, created: false, code: "REFUSED_INJECTION", reply: intent.question };

  if (intent.kind === "unclear")
    return { handled: true, created: false, code: "CLARIFICATION_REQUIRED", reply: intent.question };

  // 3 — create the durable Matter task BEFORE acknowledging.
  const task_id = taskIdFor(message);
  const approval_required = APPROVAL_REQUIRED_DOMAINS.has(intent.domain);
  const taskInput = {
    task_id,
    created_by: "mike",
    subsystem: intent.subsystem,
    owner_agent: intent.owner_agent,
    verifier_agent: "codex",
    priority: "normal",
    risk_tier: approval_required ? 3 : 1,
    approval_required,
    objective: `[from ${auth.name} by iMessage] ${intent.title}: ${intent.request_summary}`,
    expected_evidence: intent.no_estimates
      ? ["an exact figure with its source report and date range", "explicit statement of whether the number is final or unreconciled — NO ESTIMATES"]
      : ["an evidence-backed answer with its source"],
    known_limitations: intent.no_estimates
      ? "Financial answer: an estimated or fabricated number is a FAILURE, not an answer. If the books are unreconciled, say so and give the source of the current figure."
      : null,
  };

  const res = createMatterTask(taskInput, exec);
  if (!res.ok) {
    // Never acknowledge a task that does not exist.
    return { handled: true, created: false, code: "TASK_CREATE_FAILED",
             reply: "I couldn't record that request just now, so I haven't started it. Nothing is running — try again in a moment.",
             error: res.error };
  }

  // 4 — bind the task to this sender and thread, once. All later updates route here.
  bindTask({
    task_id,
    message_id: String(message.messageRowId),
    sender_id: auth.name.toLowerCase(),
    sender_display_name: auth.name,
    address: message.senderHandle,
    thread_id: message.threadId || `thread-${auth.name.toLowerCase()}`,
    approval_required,
  });

  // 5 — acknowledge, now that the task is durable.
  const ack = await notify({
    task_id,
    type: approval_required ? "approval_required" : "accepted",
    ctx: approval_required
      ? { action: intent.request_summary }
      : { agent: capitalize(intent.owner_agent), title: intent.title },
    send,
  });

  return {
    handled: true, created: res.created, code: approval_required ? "ACCEPTED_PENDING_APPROVAL" : "ACCEPTED",
    task_id, domain: intent.domain, owner_agent: intent.owner_agent,
    approval_required, reply: ack.message, notified: ack.sent,
  };
}

const capitalize = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

/**
 * Report a result back to whoever asked. Called by the executing agent through the
 * control plane — never by Mike deciding on his own that work is finished.
 *
 * The evidence level travels with the result, so the notification layer's claim guard
 * decides what words are permitted. Mike cannot upgrade "the agent says so" into
 * "verified" anywhere in this path.
 */
export async function reportResult({ task_id, state, evidenceLevel, ctx = {}, send }) {
  const b = getBinding(task_id);
  if (!b) return { sent: false, code: "UNKNOWN_TASK" };
  const moved = advanceState(task_id, { to: state, expectedVersion: b.state_version, evidenceLevel, evidenceRefs: ctx.evidenceRefs });
  if (!moved.ok) return { sent: false, code: moved.code, detail: moved.detail };

  const type = state === "COMPLETED" ? "completed"
    : state === "COMPLETED_WITH_WARNINGS" ? "completed_with_warnings"
    : state === "BLOCKED" ? "blocked"
    : state === "FAILED" ? "failed"
    : "progress";
  return notify({ task_id, type, ctx, send });
}
