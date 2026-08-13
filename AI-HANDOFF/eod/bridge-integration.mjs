// EOD <- iMESSAGE BRIDGE INTEGRATION.
//
// The single point where an inbound iMessage can start an EOD checkpoint. The bridge
// at ~/Matter/imessage-bridge calls `handleBridgeMessage` for every authorized inbound
// message; everything that is not a deliberate EOD command returns null and falls
// through to Mike's normal reply, unchanged.
//
// DISARMED BY DEFAULT. `eodEnabled` must be explicitly true. Sending the real phrase
// today does nothing, because the production trigger is not authorized yet.
//
// Codex finding `bridge-not-integrated`: the trigger previously returned a decision
// object that nothing consumed, so an authorized iMessage was never proven to invoke
// the checkpoint.
import { evaluateEodTrigger } from "./trigger.mjs";
import { runEodCheckpoint, loadRun, acknowledgementMessage } from "./eod.mjs";

/**
 * @param message  { text, senderHandle, messageRowId } — senderHandle comes from the
 *                 bridge's authenticated `handle` join, NEVER from the message body.
 * @param config   bridge.config.json contents (AUTHORIZED list, eodEnabled flag)
 * @param io       injected side effects for runEodCheckpoint (probes, backup paths, send)
 * @returns null when this is not an EOD command — the caller proceeds as normal.
 */
export async function handleBridgeMessage(message, config = {}, io = {}) {
  const decision = evaluateEodTrigger(
    {
      text: message.text,
      authenticatedHandle: message.senderHandle,
      messageRowId: message.messageRowId,
    },
    config,
  );

  // Not the command: stay out of the way entirely.
  if (!decision.trigger && decision.code === "NOT_EOD") return null;

  // It parsed as EOD but the sender may not run it. Say so plainly and do nothing
  // else — no run is created, and the refusal names no other authorized person.
  if (!decision.trigger) {
    return {
      handled: true,
      started: false,
      code: decision.code,
      reply: "I can't start an end-of-day checkpoint for this sender. Mason can authorize it.",
    };
  }

  // Armed check happens AFTER authorization so an unauthorized sender learns nothing
  // about whether the feature exists.
  if (config.eodEnabled !== true && decision.mode !== "TEST") {
    return {
      handled: true,
      started: false,
      code: "EOD_NOT_ENABLED",
      reply: "End-of-day checkpoint isn't enabled yet. It's built and tested but waiting on your go-ahead to arm the live trigger.",
    };
  }

  const result = await runEodCheckpoint(decision, io);
  if (result.replayed) {
    const r = loadRun(result.run.eod_run_id);
    return {
      handled: true, started: false, replayed: true, code: "ALREADY_RUNNING",
      eod_run_id: r.eod_run_id, status: r.status,
      reply: `That end-of-day checkpoint is already running (${r.short_id}), currently ${r.status}. I haven't started a second one.`,
    };
  }
  return {
    handled: true, started: true, mode: decision.mode,
    eod_run_id: result.run.eod_run_id, status: result.run.status,
    reply: result.acknowledgement, completion: result.completion, report: result.report,
  };
}

/**
 * The exact edit for ~/Matter/imessage-bridge/imessage-bridge.mjs. Not applied — the
 * bridge is a live process and arming it is Mason's decision.
 */
export const BRIDGE_PATCH_INSTRUCTIONS = `
In imessage-bridge.mjs, inside pollOnce(), before calling mikeReply():

    import { handleBridgeMessage } from "<repo>/AI-HANDOFF/eod/bridge-integration.mjs";

    const eod = await handleBridgeMessage(
      { text, senderHandle: row.sender, messageRowId: row.rowid },
      cfg,
      { /* probes, backup paths, queueCodexAudit, send */ },
    );
    if (eod) { sendIMessage(row.sender, eod.reply); continue; }

Then add "eodAuthorized": true to Mason's entry in bridge.config.json, and
"eodEnabled": true at the top level, ONLY when Mason approves arming it.
`.trim();
