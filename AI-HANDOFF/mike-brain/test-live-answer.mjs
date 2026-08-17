#!/usr/bin/env node
// Tests for the additive live-answer path. HERMETIC: mocked fetch + injected password, so it
// makes no network call, reads no keychain, and needs no secret. An independent read-only
// verifier can run it. SYNTHETIC data only.
import assert from "node:assert/strict";
import { answerLiveQuestion } from "./live-answer.mjs";

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};

const CFG = { AUTHORIZED: [{ handle: "+15550000001", name: "Mason", eodAuthorized: true }] };
const MASON = "+15550000001";

// A mock Command Center: login returns a cookie; /api/por/sync returns the snapshot we choose.
const mockCC = (snapshot, { loginOk = true, syncOk = true } = {}) => async (url, opts) => {
  if (String(url).endsWith("/api/auth/session"))
    return { ok: loginOk, status: loginOk ? 200 : 401, headers: { get: (h) => (h === "set-cookie" ? "sess=abc; Path=/; HttpOnly" : null) } };
  if (String(url).endsWith("/api/por/sync"))
    return { ok: syncOk, status: syncOk ? 200 : 500, json: async () => ({ syncConfigured: true, meta: { freshness: "fresh" }, snapshot }) };
  throw new Error("unexpected url " + url);
};
const nowIso = () => new Date().toISOString();
const freshSnap = { version: 1, syncedAt: nowIso(), ops: { deliveriesToday: 7, returnsDueToday: 0, openContracts: 20 } };
const io = (fetchImpl) => ({ fetchImpl, teamPassword: "test-not-a-secret" });

await t("1. live delivery count is answered with source + age", async () => {
  const r = await answerLiveQuestion({ text: "Mike, how many delivery tickets out today?", senderHandle: MASON, messageRowId: 1 }, CFG, io(mockCC(freshSnap)));
  assert.equal(r.answered, true);
  assert.equal(r.value, 7);
  assert.match(r.text, /Deliveries out today: 7/);
  assert.match(r.text, /Source: live POR via Command Center/);
});

await t("2. returns + open contracts answerable from the same snapshot", async () => {
  const ret = await answerLiveQuestion({ text: "how many returns are due today?", senderHandle: MASON, messageRowId: 2 }, CFG, io(mockCC(freshSnap)));
  assert.equal(ret.value, 0);
  const oc = await answerLiveQuestion({ text: "how many open contracts right now?", senderHandle: MASON, messageRowId: 3 }, CFG, io(mockCC(freshSnap)));
  assert.equal(oc.value, 20);
});

await t("3. STALE snapshot never presented as current — honest refusal", async () => {
  const stale = { version: 1, syncedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), ops: { deliveriesToday: 7 } };
  const r = await answerLiveQuestion({ text: "how many deliveries out today?", senderHandle: MASON, messageRowId: 4 }, CFG, io(mockCC(stale)));
  assert.equal(r.answered, true);
  assert.equal(r.value, undefined, "must NOT return a number from stale data");
  assert.match(r.text, /don't have current|older number|minutes old/i);
});

await t("4. Command Center unavailable — no number, honest message", async () => {
  const r = await answerLiveQuestion({ text: "deliveries out today?", senderHandle: MASON, messageRowId: 5 }, CFG, io(mockCC(freshSnap, { loginOk: false })));
  assert.equal(r.answered, true);
  assert.equal(r.value, undefined);
  assert.match(r.text, /can't answer that right now/i);
});

await t("5. non-data question falls through to the task path (not answered here)", async () => {
  const r = await answerLiveQuestion({ text: "can you text Josh the schedule", senderHandle: MASON, messageRowId: 6 }, CFG, io(mockCC(freshSnap)));
  assert.equal(r.answered, false);
  assert.equal(r.code, "NOT_A_LIVE_DATA_QUESTION");
});

await t("6. unauthenticated sender is answered nothing", async () => {
  const r = await answerLiveQuestion({ text: "how many deliveries out today", senderHandle: "+19995550000", messageRowId: 7 }, CFG, io(mockCC(freshSnap)));
  assert.equal(r.answered, false);
  assert.equal(r.code, "UNAUTHORIZED");
});

await t("7. no number is ever fabricated — value only when answerable", async () => {
  const noOps = { version: 1, syncedAt: nowIso(), ops: {} }; // field absent
  const r = await answerLiveQuestion({ text: "how many deliveries out today?", senderHandle: MASON, messageRowId: 8 }, CFG, io(mockCC(noOps)));
  assert.equal(r.value, undefined);
  assert.match(r.text, /doesn't carry that detail|can't answer/i);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
