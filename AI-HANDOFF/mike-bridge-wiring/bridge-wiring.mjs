// READY-TO-APPLY: transport→Matter wiring for the live iMessage bridge.
// Drop this file next to imessage-bridge.mjs (Matter repo) and add the 3-line hook shown at the
// bottom. DISARMED-friendly: it only ACTS on authenticated senders and never throws into the poll
// loop. Apply ONLY AFTER the mike-brain answer-pipeline defects #1–#3 (see MIKE_LIVE_ROUTING_P0_STATUS.md)
// are fixed — until then it would route a read-only question to "Approval required".
//
// It REUSES the committed mike-brain route (does not reimplement it).
import path from "node:path";

const MIKE_BRAIN = process.env.MIKE_BRAIN_DIR || "/Users/mikeai/grok-dashboard/AI-HANDOFF/mike-brain";
let mods = null;
async function load(log) {
  if (mods) return mods;
  try {
    mods = {
      route: await import(`${MIKE_BRAIN}/route.mjs`),
      live: await import(`${MIKE_BRAIN}/live-answer.mjs`),
    };
  } catch (e) { log?.(`mike-brain routing disabled (load failed): ${e.message}`); mods = { disabled: true }; }
  return mods;
}

// Returns { handled } — handled:true means Mike owned the message. The reply(ies) are sent via
// the provided sendIMessage. Non-authenticated / non-request messages fall through
// (handled:false) so the bridge's existing behavior is unchanged for those.
export async function routeMike({ text, senderHandle, messageRowId, threadId }, cfg, sendIMessage, log) {
  const m = await load(log);
  if (!m || m.disabled) return { handled: false };

  // FAST PATH: a read-only "current data" question is answered inline with the live figure and
  // its source/age — not routed to the approval-gated task path. If it isn't such a question
  // (or the live data is unavailable but the sender is unauthenticated), we fall through.
  try {
    const la = await m.live.answerLiveQuestion({ text, senderHandle, messageRowId, threadId }, cfg);
    if (la.answered) { sendIMessage(senderHandle, la.text); log?.(`MIKE LIVE ${la.code} ${la.field ?? ""}`); return { handled: true }; }
  } catch (e) { log?.(`live-answer error (falling through): ${e.message}`); }

  const res = await m.route.routeMessage(
    { text, senderHandle, messageRowId, threadId },
    cfg,
    { send: async (address, message) => sendIMessage(address ?? senderHandle, message) },
  );
  if (!res) return { handled: false };
  // routeMessage already sent its ack via io.send for accepted/approval paths; for the immediate
  // reply codes it returns text to deliver here.
  if (res.reply && !res.notified) { try { sendIMessage(senderHandle, res.reply); } catch (e) { log?.(`mike reply fail: ${e.message}`); } }
  log?.(`MIKE ${res.code}${res.task_id ? " " + res.task_id : ""}`);
  return { handled: true };
}

/* ---- INSERTION into imessage-bridge.mjs pollOnce(), before mikeReply() ----
   import { routeMike } from "./bridge-wiring.mjs";
   // make pollOnce async; in the loop, before the normal reply:
   const mike = await routeMike({ text, senderHandle: row.sender, messageRowId: row.rowid }, cfg, sendIMessage, log);
   if (mike.handled) continue;
   // ...then the existing const reply = mikeReply(text, name); sendIMessage(...) stays as the fallback.
   // Also: change `const next = pollOnce(cursor)` to `const next = await pollOnce(cursor)`.
*/
