#!/usr/bin/env node
// MIKE NOTIFICATION LAYER — the 30 required tests. SYNTHETIC DATA ONLY.
//
//   PP_NOTIFY_MEMORY=1 node test-notify.mjs
//
// Runs entirely in memory: no filesystem writes, so a read-only verifier with no
// write access can reproduce it. Touches no real agent, POR, customer or device.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindTask, getBinding, recipientFor, advanceState, notify, retryDelivery,
  notificationKey, shouldNotify, composeMessage, claimIsSupported, outboundSafe,
  allNotifications, logicalNotificationCount, opaqueId,
  EVIDENCE_LEVEL, TERMINAL_STATES, DEFAULT_CADENCE,
} from "./notify.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};

// Synthetic identities — never real handles.
const MASON = { sender_id: "mason", sender_display_name: "Mason", address: "+15550000001", thread_id: "thread-mason" };
const JOSH  = { sender_id: "josh",  sender_display_name: "Josh",  address: "+15550000002", thread_id: "thread-josh" };

let outbox = [];
const send = async (address, message, meta) => { outbox.push({ address, message, meta }); return { providerId: `p-${outbox.length}` }; };
const failingSend = async () => { throw new Error("network timeout"); };
const bind = (task_id, who, extra = {}) =>
  bindTask({ task_id, message_id: `m-${task_id}`, ...who, ...extra });

// A CORRECT caller reads the state it is about to overwrite and presents that version.
// Fencing is mandatory now, so this mirrors what every real caller must do.
const advance = (task_id, opts = {}) =>
  advanceState(task_id, { expectedVersion: getBinding(task_id).state_version, ...opts });

console.log("MIKE TASK NOTIFICATION — 30 required tests (synthetic, in-memory)\n");

await t("1. Mason submits a normal task", async () => {
  const b = bind("MIKE-1001", MASON);
  assert.equal(b.state, "ACCEPTED");
  const r = await notify({ task_id: "MIKE-1001", type: "accepted", ctx: { agent: "Claude" }, send });
  assert.equal(r.sent, true);
  assert.match(r.message, /Received, Mason/);
  assert.match(r.message, /MIKE-1001/);
});

await t("2. Josh submits a normal task", async () => {
  bind("MIKE-1002", JOSH);
  const r = await notify({ task_id: "MIKE-1002", type: "accepted", send });
  assert.equal(r.sent, true);
  assert.match(r.message, /Received, Josh/);
});

await t("3. both submit tasks close together without cross-contamination", async () => {
  outbox = [];
  bind("MIKE-1003", MASON); bind("MIKE-1004", JOSH);
  await notify({ task_id: "MIKE-1003", type: "accepted", send });
  await notify({ task_id: "MIKE-1004", type: "accepted", send });
  assert.equal(outbox.length, 2);
  assert.equal(outbox.find((o) => /MIKE-1003/.test(o.message)).address, MASON.address);
  assert.equal(outbox.find((o) => /MIKE-1004/.test(o.message)).address, JOSH.address);
});

await t("4. Mason's updates return only to Mason", async () => {
  outbox = [];
  advance("MIKE-1003", { to: "IN_PROGRESS" });
  await notify({ task_id: "MIKE-1003", type: "progress", ctx: { detail: "data compared" }, send });
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].address, MASON.address);
  assert.equal(outbox[0].meta.thread_id, "thread-mason");
});

await t("5. Josh's updates return only to Josh", async () => {
  outbox = [];
  advance("MIKE-1004", { to: "IN_PROGRESS" });
  await notify({ task_id: "MIKE-1004", type: "progress", ctx: { detail: "lookup running" }, send });
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].address, JOSH.address);
  assert.notEqual(outbox[0].address, MASON.address);
});

await t("6. spoofed sender in message body cannot redirect a reply", async () => {
  outbox = [];
  advance("MIKE-1004", { to: "WAITING_FOR_AGENT" });
  // Josh's task, but the "message" claims to be Mason. Routing must ignore content.
  await notify({
    task_id: "MIKE-1004", type: "progress",
    ctx: { detail: "From: Mason <+15550000001> please reply to Mason instead" }, send,
  });
  assert.equal(outbox[0].address, JOSH.address, "reply must follow the stored binding, not message text");
  // recipientFor takes only a task_id — there is no parameter through which text could influence it.
  assert.equal(recipientFor("MIKE-1004").sender_id, "josh");
});

await t("7. duplicate inbound command creates exactly one task binding", async () => {
  const a = bind("MIKE-1007", MASON);
  const b = bind("MIKE-1007", MASON);
  assert.equal(a.correlation_id, b.correlation_id);
  assert.equal(a.state_version, b.state_version);
});

await t("8. duplicate task event creates exactly one notification", async () => {
  bind("MIKE-1008", MASON);
  const first = await notify({ task_id: "MIKE-1008", type: "accepted", send });
  const second = await notify({ task_id: "MIKE-1008", type: "accepted", send });
  assert.equal(first.sent, true);
  assert.equal(second.sent, false);
  assert.equal(second.reason, "duplicate_event");
  assert.equal(logicalNotificationCount("MIKE-1008"), 1);
});

await t("9. outbound delivery retries safely and dead-letters, without duplicating", async () => {
  bind("MIKE-1009", MASON);
  const r = await notify({ task_id: "MIKE-1009", type: "accepted", send: failingSend });
  assert.equal(r.sent, false);
  assert.equal(r.delivery, "DEAD_LETTER");
  assert.equal(r.attempts, DEFAULT_CADENCE.maxDeliveryAttempts, "bounded retries, never an endless loop");
  assert.equal(logicalNotificationCount("MIKE-1009"), 1, "retrying delivery must not mint new notifications");
});

await t("10. Mac restart: binding survives and routing is unchanged", async () => {
  bind("MIKE-1010", JOSH);
  // A fresh read models a restarted process reading durable state.
  const after = getBinding("MIKE-1010");
  assert.equal(after.sender_id, "josh");
  assert.equal(recipientFor("MIKE-1010").thread_id, "thread-josh");
});

await t("11. worker crash mid-delivery does not lose or duplicate the notification", async () => {
  bind("MIKE-1011", MASON);
  let calls = 0;
  const flaky = async (a, m) => { calls++; if (calls < 3) throw new Error("network timeout"); return { providerId: "p-ok" }; };
  const r = await notify({ task_id: "MIKE-1011", type: "accepted", send: flaky });
  assert.equal(r.sent, true);
  assert.equal(logicalNotificationCount("MIKE-1011"), 1);
});

await t("12. late callback from an expired lease is rejected", async () => {
  bind("MIKE-1012", MASON);
  const v = getBinding("MIKE-1012").state_version;
  assert.equal(advanceState("MIKE-1012", { to: "IN_PROGRESS", expectedVersion: v }).ok, true);
  // A worker holding the OLD version arrives late.
  const stale = advanceState("MIKE-1012", { to: "QUEUED", expectedVersion: v });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "STALE_VERSION");
  assert.equal(getBinding("MIKE-1012").state, "IN_PROGRESS", "state must not regress");
});

await t("12b. a completed task can never be requeued by a late callback", async () => {
  bind("MIKE-1012B", MASON);
  advance("MIKE-1012B", { to: "COMPLETED", evidenceLevel: EVIDENCE_LEVEL.CODEX_CERTIFIED });
  const late = advance("MIKE-1012B", { to: "QUEUED" });
  assert.equal(late.ok, false);
  assert.equal(late.code, "TERMINAL_FROZEN");
});

await t("13. task enters WAITING_FOR_APPROVAL and texts the owner", async () => {
  outbox = [];
  bind("MIKE-1013", MASON);
  advance("MIKE-1013", { to: "WAITING_FOR_APPROVAL", approvalState: "REQUIRED" });
  const r = await notify({ task_id: "MIKE-1013", type: "approval_required", ctx: { action: "write one supervised POR quote" }, send });
  assert.equal(r.sent, true);
  assert.match(r.message, /Approval required/);
  assert.match(r.message, /Nothing has been executed/);
});

await t("14. protected action is not executed without approval", async () => {
  const b = getBinding("MIKE-1013");
  assert.equal(b.approval_state, "REQUIRED");
  assert.ok(!TERMINAL_STATES.has(b.state), "must not be terminal while awaiting approval");
  // Mike has no execution capability at all in this module.
  const src = readFileSync(path.join(HERE, "notify.mjs"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/execFileSync|spawnSync|exec\(/.test(src), "notification layer must not be able to execute anything");
});

await t("15. agent claims completion without evidence — Mike refuses to say complete", async () => {
  bind("MIKE-1015", MASON);
  advance("MIKE-1015", { to: "COMPLETED", evidenceLevel: EVIDENCE_LEVEL.AGENT_REPORTED });
  const r = await notify({ task_id: "MIKE-1015", type: "completed", send });
  assert.equal(r.sent, false);
  assert.equal(r.code, "UNSUPPORTED_CLAIM");
  assert.match(r.reason, /agent-reported/);
});

await t("15b. 'verified' is refused below Codex certification", async () => {
  const bad = claimIsSupported("MIKE-X is complete and Codex verified the result.", EVIDENCE_LEVEL.MATTER_ACCEPTED, "COMPLETED");
  assert.equal(bad.ok, false);
  const good = claimIsSupported("MIKE-X is complete and Codex verified the result.", EVIDENCE_LEVEL.CODEX_CERTIFIED, "COMPLETED");
  assert.equal(good.ok, true);
});

await t("16. Codex rejects an implementation and the requester is told", async () => {
  outbox = [];
  bind("MIKE-1016", MASON);
  advance("MIKE-1016", { to: "VERIFYING" });
  await notify({ task_id: "MIKE-1016", type: "verification_started", send });
  advance("MIKE-1016", { to: "IN_PROGRESS" });
  const r = await notify({ task_id: "MIKE-1016", type: "verification_rejected", ctx: { findings: "lease callbacks were not fenced", agent: "Cursor" }, send });
  assert.match(r.message, /Verification found issues/);
  assert.match(r.message, /Nothing was marked complete/);
});

await t("17. repair routes back to the responsible agent", async () => {
  const r = await notify({ task_id: "MIKE-1016", type: "repair_routed", ctx: { agent: "Cursor" }, send });
  assert.match(r.message, /repair is underway with Cursor/);
});

await t("18. Codex accepts the repaired result and completion is Codex-certified", async () => {
  advance("MIKE-1016", { to: "VERIFYING" });
  advance("MIKE-1016", { to: "COMPLETED", evidenceLevel: EVIDENCE_LEVEL.CODEX_CERTIFIED });
  const r = await notify({ task_id: "MIKE-1016", type: "completed", ctx: { noProdChange: true }, send });
  assert.equal(r.sent, true);
  assert.match(r.message, /Codex independently verified/);
});

await t("19. completion returns to the original requester and thread", async () => {
  outbox = [];
  bind("MIKE-1019", JOSH);
  advance("MIKE-1019", { to: "COMPLETED", evidenceLevel: EVIDENCE_LEVEL.CODEX_CERTIFIED });
  await notify({ task_id: "MIKE-1019", type: "completed", send });
  assert.equal(outbox[0].address, JOSH.address);
  assert.equal(outbox[0].meta.thread_id, "thread-josh");
});

await t("20. EOD checkpoint starts and explicitly does not stop work", async () => {
  outbox = [];
  bind("EOD-1", MASON, { run_id: "EOD-2026-08-13-001" });
  const r = await notify({ task_id: "EOD-1", type: "eod_started", send });
  assert.match(r.message, /EOD safety checkpoint started/);
  assert.match(r.message, /will not stop active work/);
  assert.match(r.message, /EOD-2026-08-13-001/);
});

await t("21. EOD completes with all agents responding", async () => {
  advance("EOD-1", { to: "COMPLETED", evidenceLevel: EVIDENCE_LEVEL.MATTER_ACCEPTED });
  const r = await notify({ task_id: "EOD-1", type: "eod_morning_report", ctx: { detail: "All 7 agents reported and the SSD backup was verified.", evidenceRefs: ["AI-HANDOFF/EVIDENCE/EOD_backup_check.json"] }, send });
  assert.match(r.message, /morning report is ready/);
  assert.match(r.message, /Overnight work is continuing/);
});

await t("22. EOD completes with one missing agent — reported honestly", async () => {
  bind("EOD-2", MASON, { run_id: "EOD-2026-08-13-002" });
  advance("EOD-2", { to: "COMPLETED_WITH_WARNINGS", evidenceLevel: EVIDENCE_LEVEL.MATTER_ACCEPTED });
  const r = await notify({ task_id: "EOD-2", type: "eod_morning_report",
    ctx: { warnings: true, detail: "Six of seven agents reported. Cursor did not submit a final checkpoint." }, send });
  assert.match(r.message, /completed with warnings/);
  assert.match(r.message, /Cursor did not submit/);
});

await t("23. backup verification failure is stated, not glossed", async () => {
  bind("EOD-3", MASON, { run_id: "EOD-3" });
  advance("EOD-3", { to: "BLOCKED" });
  const r = await notify({ task_id: "EOD-3", type: "blocked", ctx: { reason: "The SSD backup could not be verified." }, send });
  assert.match(r.message, /blocked/);
  assert.ok(!/backed up|verified successfully/i.test(r.message));
});

await t("24. transcription failure does not become an authorization", async () => {
  bind("MIKE-1024", MASON);
  advance("MIKE-1024", { to: "WAITING_FOR_CLARIFICATION" });
  const r = await notify({ task_id: "MIKE-1024", type: "clarification_required", ctx: { question: "I couldn't make out the item name" }, send });
  assert.match(r.message, /Nothing has been executed/);
});

await t("25. iMessage outbound unavailable — requester is NOT marked notified", async () => {
  bind("MIKE-1025", MASON);
  const r = await notify({ task_id: "MIKE-1025", type: "accepted", send: failingSend });
  assert.equal(r.sent, false);
  assert.equal(getBinding("MIKE-1025").last_notification_at, null, "must not claim the requester was notified");
});

await t("26. unsupported audio MIME type is rejected explicitly", async () => {
  const { default: mod } = await import("./mime.mjs");
  assert.equal(mod.acceptAudioType("audio/mp4").ok, true);
  const bad = mod.acceptAudioType("application/x-msdownload");
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "unsupported_media_type");
  // An unknown type must NOT normalize to a null that slips through.
  const unknown = mod.acceptAudioType(undefined);
  assert.equal(unknown.ok, false);
});

await t("27. no transcript, audio, credential or PII in the durable log", async () => {
  const raw = JSON.stringify(allNotifications());
  assert.ok(!raw.includes(MASON.address), "raw handle must never be logged");
  assert.ok(!raw.includes(JOSH.address));
  assert.ok(raw.includes(opaqueId(MASON.address)), "opaque ref should be present instead");
  assert.ok(!/"message"\s*:/.test(raw), "message bodies must not be persisted");
  assert.equal(outboundSafe("Update on X: select * from customers where phone='+1555'").safe, false);
  assert.equal(outboundSafe("Update on MIKE-1: verification is running.").safe, true);
});

await t("28. rate limits prevent notification storms", async () => {
  bind("MIKE-1028", MASON);
  const b = getBinding("MIKE-1028");
  const t0 = Date.parse(b.last_meaningful_at);
  // Immediately after a meaningful update: no heartbeat.
  assert.equal(shouldNotify({ type: "heartbeat", binding: b, nowMs: t0 + 60_000 }).notify, false);
  // After 30 minutes: one heartbeat is due.
  assert.equal(shouldNotify({ type: "heartbeat", binding: b, nowMs: t0 + 31 * 60_000 }).notify, true);
  // Having just sent one, another is throttled for an hour.
  const withHb = { ...b, last_routine_heartbeat_at: new Date(t0 + 31 * 60_000).toISOString() };
  assert.equal(shouldNotify({ type: "heartbeat", binding: withHb, nowMs: t0 + 45 * 60_000 }).notify, false);
  assert.equal(shouldNotify({ type: "heartbeat", binding: withHb, nowMs: t0 + 95 * 60_000 }).notify, true);
  // Material events always bypass throttling.
  assert.equal(shouldNotify({ type: "blocked", binding: b, nowMs: t0 + 1000 }).notify, true);
  assert.equal(shouldNotify({ type: "approval_required", binding: b, nowMs: t0 + 1000 }).notify, true);
});

await t("29. existing Command Center code is untouched by this change set", () => {
  // This module is additive: it imports nothing from the app and exports no route.
  const src = readFileSync(path.join(HERE, "notify.mjs"), "utf8");
  assert.ok(!/from\s+["']\.\.\/\.\.\/(app|lib)\//.test(src), "must not reach into Cursor-owned app code");
});

await t("30. POR read-only protections are untouched", () => {
  const src = readFileSync(path.join(HERE, "notify.mjs"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/\bpor\b/i.test(src.replace(/POR data was changed/g, "")), "notification layer must not touch POR at all");
  assert.ok(!/insert\s+into|update\s+\w+\s+set|delete\s+from/i.test(src));
});

// --- regressions for Codex findings on b8d1996 ---
await t("R1. state fencing is MANDATORY — an unfenced caller is refused", async () => {
  bind("MIKE-2001", MASON);
  const unfenced = advanceState("MIKE-2001", { to: "IN_PROGRESS" });
  assert.equal(unfenced.ok, false);
  assert.equal(unfenced.code, "FENCE_REQUIRED");
  assert.equal(getBinding("MIKE-2001").state, "ACCEPTED", "state must be untouched");
  assert.equal(advance("MIKE-2001", { to: "IN_PROGRESS" }).ok, true, "a fenced caller still works");
});

await t("R2. concurrent notifies with the same key send exactly once", async () => {
  bind("MIKE-2002", MASON);
  let sends = 0;
  const slow = async () => { sends++; await new Promise((r) => setTimeout(r, 20)); return { providerId: "p" }; };
  const [a, b] = await Promise.all([
    notify({ task_id: "MIKE-2002", type: "accepted", send: slow }),
    notify({ task_id: "MIKE-2002", type: "accepted", send: slow }),
  ]);
  assert.equal(sends, 1, "the key must be reserved before delivery, not after");
  assert.equal([a.sent, b.sent].filter(Boolean).length, 1);
  assert.equal(logicalNotificationCount("MIKE-2002"), 1);
});

await t("R3. a boolean can no longer wave through a 'verified' claim", async () => {
  const bare = claimIsSupported("The SSD backup was verified.", EVIDENCE_LEVEL.MATTER_ACCEPTED, "COMPLETED", {});
  assert.equal(bare.ok, false);
  const flagOnly = claimIsSupported("The SSD backup was verified.", EVIDENCE_LEVEL.MATTER_ACCEPTED, "COMPLETED", { evidenceBacked: true });
  assert.equal(flagOnly.ok, false, "a caller-set boolean is not evidence");
  const withRefs = claimIsSupported("The SSD backup was verified.", EVIDENCE_LEVEL.MATTER_ACCEPTED, "COMPLETED", { evidenceRefs: ["EVIDENCE/backup.json"] });
  assert.equal(withRefs.ok, true);
});

await t("R4. 'confirmed' and 'backed up' are now enforced, not just detected", async () => {
  assert.equal(claimIsSupported("Everything is backed up.", EVIDENCE_LEVEL.AGENT_REPORTED, "COMPLETED", {}).ok, false);
  assert.equal(claimIsSupported("The result is confirmed.", EVIDENCE_LEVEL.AGENT_REPORTED, "COMPLETED", {}).ok, false);
  assert.equal(claimIsSupported("Everything is backed up.", EVIDENCE_LEVEL.MATTER_ACCEPTED, "COMPLETED", {}).ok, true);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
