#!/usr/bin/env node
// MIKE LIVE-DATA TOOLS — stale-data rule tests. SYNTHETIC, no network.
//
//   node test-tools.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  needsCurrentData, fetchLiveSnapshot, readOpsField, answerFor, formatAnswer,
  fieldForQuestion, MAX_FRESH_MS,
} from "./tools.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};

const SNAP = { ops: { openContracts: 49, deliveriesToday: 4, returnsDueToday: 2 } };
const fresh = (overrides = {}) => async () => ({
  ok: true,
  json: async () => ({
    porSyncConfigured: true, porSnapshotPresent: true,
    porSnapshotStale: false, porSnapshotVeryStale: false,
    porSnapshotFreshness: "fresh",
    porSyncedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    ...overrides,
  }),
});

console.log("MIKE LIVE TOOLS — stale-data rule (synthetic)\n");

await t("current-data words are recognized", () => {
  for (const q of ["how many deliveries today", "what's open right now", "current inventory",
                   "anything still outstanding", "what's available tonight"])
    assert.equal(needsCurrentData(q), true, q);
  assert.equal(needsCurrentData("what was our 2025 revenue"), false);
});

await t("ACCEPTANCE 1 shape: delivery count answers from live data with its age", async () => {
  const live = await fetchLiveSnapshot({ fetchImpl: fresh() });
  assert.equal(live.ok, true);
  const r = answerFor({ question: "Mike, how many delivery tickets did we have out today?", live, snapshot: SNAP, field: "deliveriesToday" });
  assert.equal(r.answerable, true);
  assert.equal(r.value, 4);
  const text = formatAnswer("Delivery tickets out today", r);
  assert.match(text, /4/);
  assert.match(text, /live POR via Command Center/);
  assert.match(text, /synced \d+ min ago/, "the answer must name its source and age");
});

await t("STALE RULE: a stale snapshot refuses rather than answering", async () => {
  const live = await fetchLiveSnapshot({ fetchImpl: fresh({ porSnapshotStale: true }) });
  assert.equal(live.ok, false);
  assert.equal(live.code, "LIVE_STALE");
  const r = answerFor({ question: "how many deliveries today?", live, snapshot: SNAP, field: "deliveriesToday" });
  assert.equal(r.answerable, false);
  assert.match(r.text, /don't have current Point of Rental data/);
  assert.match(r.text, /not going to give you an older number/);
});

await t("STALE RULE: an old-but-not-flagged snapshot is still refused by our own ceiling", async () => {
  const old = new Date(Date.now() - (MAX_FRESH_MS + 60000)).toISOString();
  const live = await fetchLiveSnapshot({ fetchImpl: fresh({ porSyncedAt: old }) });
  assert.equal(live.ok, false, "we must not rely solely on the service's own stale flag");
  assert.equal(live.code, "LIVE_STALE");
});

await t("STALE RULE: unreachable live path never silently degrades", async () => {
  const boom = async () => { throw new Error("network down"); };
  const live = await fetchLiveSnapshot({ fetchImpl: boom });
  assert.equal(live.ok, false);
  assert.equal(live.code, "LIVE_UNREACHABLE");
  const r = answerFor({ question: "what's open today?", live, snapshot: SNAP, field: "openContracts" });
  assert.equal(r.answerable, false);
});

await t("ACCEPTANCE 2 shape: a field the snapshot lacks is refused, not inferred", async () => {
  const live = await fetchLiveSnapshot({ fetchImpl: fresh() });
  const r = answerFor({ question: "what deliveries are still open today?", live, snapshot: SNAP, field: "openDeliveryDetail" });
  assert.equal(r.answerable, false);
  assert.equal(r.code, "FIELD_NOT_PRESENT");
  assert.match(r.text, /doesn't carry that detail/);
  assert.match(r.text, /new field in the sync/, "must say what would be needed, not guess");
});

await t("a count is never turned into a list", () => {
  const r = readOpsField(SNAP, "deliveriesToday");
  assert.equal(r.value, 4);
  assert.equal(readOpsField(SNAP, "deliveryList").ok, false, "there is no list field to read");
});

await t("THE HARD GUARANTEE: this module has no path to the SSD at all", () => {
  const src = readFileSync(path.join(HERE, "tools.mjs"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  // Match SSD PATH markers specifically. An earlier version also matched "PARTYPERF",
  // which false-positives on the production URL partyperfect.app — the live path we
  // actually want. Tightened rather than relaxed: these are all real SSD indicators.
  const sslPath = /\/Volumes\/|PARTY-PERFECT-BRAIN|RAW-EXPORTS|POR-FULL-DATA|node:fs|readFileSync|readdirSync|\.csv\b/i;
  assert.ok(!sslPath.test(src),
    "the stale-data rule is enforced by the ABSENCE of an SSD path, not by wording");
  assert.ok(!/import .* from "node:fs"/.test(src), "no filesystem access at all");
});

await t("historical questions are not forced through the live gate", () => {
  assert.equal(needsCurrentData("what was our net income in 2025"), false);
  assert.equal(fieldForQuestion("what was our 2025 revenue"), null, "no live ops field claims to answer history");
});

await t("question -> field mapping is explicit and returns null when unknown", () => {
  assert.equal(fieldForQuestion("how many delivery tickets today?"), "deliveriesToday");
  assert.equal(fieldForQuestion("what returns are due today"), "returnsDueToday");
  assert.equal(fieldForQuestion("how many open contracts"), "openContracts");
  assert.equal(fieldForQuestion("who is the best salesperson"), null);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
