#!/usr/bin/env npx tsx
/**
 * OWNER-AI-COST-USAGE-001 tests. Synthetic usage only. No provider secrets.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  buildAgentRows,
  buildExecutiveSummary,
  buildProviderRows,
  buildTaskRows,
  evaluateAlerts,
  exportCsv,
  ingestUsageEvents,
  upsertBudget,
  upsertSubscription,
  type AiCostEngine,
} from "../lib/ai-cost";
import {
  collectorCanReadDashboard,
  hashAiCostIngestToken,
  ownerSessionImpersonatesCollector,
  verifyAiCostIngestBearer,
} from "../lib/ai-cost-auth";
import {
  chicagoDayBounds,
  chicagoLocalToUtc,
  chicagoYmd,
  calculateTokenCost,
  csvEscape,
  displayMoney,
  moneyBucket,
  addKnown,
  payloadHasSecret,
  projectMonthEnd,
  prorateFixedForMonth,
  usdToMicros,
  microsToUsdNumber,
  selectRate,
  type RateRow,
} from "../lib/ai-cost-math";
import { AI_COST_INGEST_MAX_BYTES } from "../lib/ai-cost-policy";
import { enforceAiCostIngestLimit, resetAiCostRateLimitForTests } from "../lib/ai-cost-rate-limit";
import { createMemoryAiCostStore } from "../lib/ai-cost-store";
import { roleHasPermission } from "../lib/api-auth-matrix.mjs";
import { matterHttpGate } from "../lib/matter-http";
import { isOwnerSection } from "../lib/auth";
import { canAccessSection } from "../lib/user-roles";
import { SEED_SUBSCRIPTIONS } from "../lib/ai-cost-policy";

export {};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

const RATES: RateRow[] = [
  {
    provider: "xai",
    model: "grok-4",
    version: "v1",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    inputPer1m: 1,
    outputPer1m: 2,
    cachedPer1m: 0.1,
  },
  {
    provider: "xai",
    model: "grok-4",
    version: "v2",
    effectiveFrom: "2026-07-01T00:00:00.000Z",
    inputPer1m: 10,
    outputPer1m: 20,
    cachedPer1m: 1,
  },
];

function engine(at: string, store = createMemoryAiCostStore(() => at)): AiCostEngine {
  return {
    store,
    rates: RATES,
    now: () => new Date(at),
    governorPayload: null,
  };
}

async function main() {
await check("1 non-owner denied ai_cost permission + nav", () => {
  assert.equal(roleHasPermission("employee", "ai_cost"), false);
  assert.equal(canAccessSection("employee", "ai_cost"), false);
  assert.equal(isOwnerSection("ai_cost"), true);
  const gate = matterHttpGate({ role: "SHOWROOM", resource: "payment", action: "read" });
  assert.equal(gate.allowed, false);
});

await check("2 unauthenticated ingest denied", () => {
  assert.equal(verifyAiCostIngestBearer(null, { AI_COST_INGEST_TOKEN_SHA256: hashAiCostIngestToken("test-token-aa") }), false);
  assert.equal(verifyAiCostIngestBearer("Bearer wrong", { AI_COST_INGEST_TOKEN_SHA256: hashAiCostIngestToken("test-token-aa") }), false);
});

await check("3 owner allowed ai_cost + Matter payment read", () => {
  assert.equal(roleHasPermission("owner", "ai_cost"), true);
  assert.equal(canAccessSection("owner", "ai_cost"), true);
  const gate = matterHttpGate({ role: "OWNER", resource: "payment", action: "read", approval_granted: false });
  assert.equal(gate.allowed, true);
});

await check("4 no provider credentials in API-shaped payload", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  const summary = await buildExecutiveSummary(e);
  const providers = await buildProviderRows(e);
  const blob = JSON.stringify({ summary, providers });
  assert.equal(payloadHasSecret(blob), false);
  assert.doesNotMatch(blob, /sk-|xai-|SERVICE_ROLE|postgres:\/\//i);
});

await check("5 duplicate usage event counted once", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  const ev = {
    idempotencyKey: "dup-1",
    occurredAt: "2026-08-13T16:00:00.000Z",
    agentId: "mike",
    provider: "xai",
    model: "grok-4",
    inputTokens: 1000,
    outputTokens: 500,
    estimatedCostUsd: 0.01,
  };
  const first = await ingestUsageEvents(e, [ev]);
  const second = await ingestUsageEvents(e, [ev]);
  assert.equal(first.accepted, 1);
  assert.equal(second.duplicates, 1);
  assert.equal((await e.store.listUsage()).length, 1);
});

await check("6 retry cost represented accurately", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [
    {
      idempotencyKey: "retry-a",
      occurredAt: "2026-08-13T16:00:00.000Z",
      agentId: "mike",
      taskId: "task-1",
      correlationId: "task-1",
      provider: "xai",
      retries: 2,
      estimatedCostUsd: 0.03,
      status: "completed",
    },
  ]);
  const agents = await buildAgentRows(e);
  const mike = agents.find((a) => a.agentId === "mike");
  assert.ok(mike);
  assert.match(mike.retryCost.display, /0\.03/);
});

await check("7 fixed subscription not double-counted as API spend", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [
    {
      idempotencyKey: "meter-1",
      occurredAt: "2026-08-13T16:00:00.000Z",
      agentId: "mike",
      provider: "xai",
      estimatedCostUsd: 1.5,
    },
  ]);
  await e.store.recordImportRun({
    collectorId: "test",
    lastSuccessAt: "2026-08-13T17:00:00.000Z",
    lastAttemptAt: "2026-08-13T17:00:00.000Z",
    lastError: null,
    status: "ok",
  });
  const summary = await buildExecutiveSummary(e);
  assert.equal(summary.fixedMonthly.known, 244);
  assert.equal(summary.meteredThisMonth.known, 1.5);
  assert.ok(summary.estimatedTotalThisMonth.display.includes("not verified"));
  assert.notEqual(summary.fixedMonthly.known, summary.meteredThisMonth.known);
});

await check("8 estimated and verified remain distinguishable", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [
    {
      idempotencyKey: "both-1",
      occurredAt: "2026-08-13T16:00:00.000Z",
      agentId: "claude",
      provider: "anthropic",
      estimatedCostUsd: 2,
      verifiedCostUsd: 1.8,
    },
  ]);
  await e.store.recordImportRun({
    collectorId: "anthropic",
    lastSuccessAt: "2026-08-13T17:00:00.000Z",
    lastAttemptAt: "2026-08-13T17:00:00.000Z",
    lastError: null,
    status: "ok",
  });
  const summary = await buildExecutiveSummary(e);
  assert.equal(summary.meteredThisMonth.verification === "UNVERIFIED" || summary.meteredThisMonth.class === "ESTIMATED", true);
  assert.equal(summary.providerVerifiedTotal.known, 1.8);
  assert.equal(summary.providerVerifiedTotal.verification, "PROVIDER_VERIFIED");
  assert.notEqual(summary.estimatedTotalThisMonth.display, summary.providerVerifiedTotal.display);
});

await check("9 America/Chicago day boundaries", () => {
  const before = new Date("2026-08-13T04:59:00.000Z");
  const after = new Date("2026-08-13T05:00:00.000Z");
  assert.equal(chicagoYmd(before), "2026-08-12");
  assert.equal(chicagoYmd(after), "2026-08-13");
  const bounds = chicagoDayBounds(after);
  assert.ok(before.getTime() < bounds.start.getTime());
  assert.ok(after.getTime() >= bounds.start.getTime());
  const midnight = chicagoLocalToUtc(2026, 8, 13, 0, 0, 0);
  assert.equal(chicagoYmd(midnight), "2026-08-13");
  assert.equal(chicagoYmd(new Date(midnight.getTime() - 1000)), "2026-08-12");
});

await check("10 projection for partial month", () => {
  const p = projectMonthEnd({
    monthToDateKnown: 13,
    knownCount: 3,
    unknownCount: 0,
    dayOfMonth: 13,
    daysInMonth: 31,
  });
  assert.equal(p.value, 31);
  const empty = projectMonthEnd({
    monthToDateKnown: 0,
    knownCount: 0,
    unknownCount: 0,
    dayOfMonth: 13,
    daysInMonth: 31,
  });
  assert.equal(empty.value, null);
  assert.equal(empty.display, "UNKNOWN");
});

await check("11 rate-version changes do not apply retroactively", () => {
  const june = selectRate(RATES, "xai", "grok-4", "2026-06-15T12:00:00.000Z");
  const july = selectRate(RATES, "xai", "grok-4", "2026-07-15T12:00:00.000Z");
  assert.equal(june?.version, "v1");
  assert.equal(july?.version, "v2");
  const oldCost = calculateTokenCost({ inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0, rate: june });
  const newCost = calculateTokenCost({ inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0, rate: july });
  assert.equal(oldCost.amount, 1);
  assert.equal(newCost.amount, 10);
});

await check("12 unknown provider visible without crashing", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [
    {
      idempotencyKey: "unk-1",
      occurredAt: "2026-08-13T16:00:00.000Z",
      agentId: "local_worker",
      provider: "mystery-lab",
      estimatedCostUsd: 0.4,
    },
  ]);
  await e.store.recordImportRun({
    collectorId: "mystery-lab",
    lastSuccessAt: "2026-08-13T17:00:00.000Z",
    lastAttemptAt: "2026-08-13T17:00:00.000Z",
    lastError: null,
    status: "ok",
  });
  const providers = await buildProviderRows(e);
  const row = providers.find((p) => p.providerId === "mystery-lab");
  assert.ok(row);
  assert.equal(row.metered.known, 0.4);
  const summary = await buildExecutiveSummary(e);
  assert.ok(Number.isFinite(summary.meteredThisMonth.known));
});

await check("13 personal and Party Perfect domains remain separated", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [
    {
      idempotencyKey: "pp-1",
      occurredAt: "2026-08-13T16:00:00.000Z",
      agentId: "mike",
      provider: "xai",
      domain: "party_perfect",
      estimatedCostUsd: 5,
    },
    {
      idempotencyKey: "me-1",
      occurredAt: "2026-08-13T16:05:00.000Z",
      agentId: "matter",
      provider: "anthropic",
      domain: "mershon_personal",
      estimatedCostUsd: 9,
    },
  ]);
  await e.store.recordImportRun({
    collectorId: "split",
    lastSuccessAt: "2026-08-13T17:00:00.000Z",
    lastAttemptAt: "2026-08-13T17:00:00.000Z",
    lastError: null,
    status: "ok",
  });
  const summary = await buildExecutiveSummary(e);
  assert.equal(summary.meteredThisMonth.known, 5);
  const personal = await buildTaskRows(e, "mershon_personal");
  const business = await buildTaskRows(e, "party_perfect");
  assert.equal(personal.length, 1);
  assert.equal(business.length, 1);
  assert.equal(personal[0].domain, "mershon_personal");
});

await check("14 cost alerts deduplicate", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [
    {
      idempotencyKey: "ua-1",
      occurredAt: "2026-08-13T16:00:00.000Z",
      agentId: "unknown",
      provider: "xai",
      estimatedCostUsd: 0.01,
    },
  ]);
  await evaluateAlerts(e);
  await evaluateAlerts(e);
  const alerts = (await e.store.listAlerts()).filter((a) => a.type === "unattributed_usage");
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].count >= 2);
});

await check("15 collector failure is stale not false zero", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await e.store.recordImportRun({
    collectorId: "claude-mac",
    lastAttemptAt: "2026-08-13T17:00:00.000Z",
    lastSuccessAt: null,
    lastError: "timeout",
    status: "failed",
  });
  const summary = await buildExecutiveSummary(e);
  assert.equal(summary.dataFreshness.stale, true);
  assert.match(summary.meteredToday.display, /UNAVAILABLE|UNKNOWN|stale/i);
  assert.doesNotMatch(summary.meteredToday.display, /^\$0\.00$/);
});

await check("secret scan of cost modules + migration", () => {
  const files = [
    "lib/ai-cost.ts",
    "lib/ai-cost-policy.ts",
    "lib/ai-cost-math.ts",
    "app/api/ai-cost/ingest/route.ts",
    "supabase/migrations/0008_ai_cost_control.sql",
    "AI-HANDOFF/EVIDENCE/OWNER-AI-COST-USAGE-001.md",
  ];
  for (const rel of files) {
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    assert.equal(payloadHasSecret(text), false, rel);
  }
});

await check("CSV export has no prompts or secrets", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [
    {
      idempotencyKey: "csv-1",
      occurredAt: "2026-08-13T16:00:00.000Z",
      agentId: "mike",
      provider: "xai",
      estimatedCostUsd: 0.02,
    },
  ]);
  const csv = await exportCsv(e);
  assert.match(csv, /occurred_at/);
  assert.doesNotMatch(csv, /prompt|transcript|sk-/i);
});

await check("future-dated usage rejected", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  const res = await ingestUsageEvents(e, [
    {
      idempotencyKey: "future-1",
      occurredAt: "2026-12-01T00:00:00.000Z",
      agentId: "mike",
      provider: "xai",
      estimatedCostUsd: 1,
    },
  ]);
  assert.equal(res.rejected, 1);
  assert.ok(res.errors.includes("future_dated"));
});

await check("secret payload rejected", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  const res = await ingestUsageEvents(e, [
    {
      idempotencyKey: "sec-1",
      occurredAt: "2026-08-13T16:00:00.000Z",
      agentId: "mike",
      provider: "openai",
      estimatedCostUsd: 1,
      providerEventRef: "sk-abcdefghijklmnopqrstuvwxyz123456",
    },
  ]);
  assert.equal(res.accepted, 0);
  assert.ok(res.errors.includes("secret_in_payload"));
});

await check("subscription edit is audited and does not invent Cursor $0", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  const cursor = SEED_SUBSCRIPTIONS.find((s) => s.id === "sub-cursor");
  assert.equal(cursor?.amount, null);
  await upsertSubscription(e, { id: "sub-cursor", notes: "still unknown" }, "owner");
  const audit = await e.store.listAudit();
  assert.ok(audit.some((a) => a.action.startsWith("subscription.")));
  const summary = await buildExecutiveSummary(e);
  assert.ok(summary.fixedMonthly.unknownCount >= 1);
  assert.match(summary.fixedMonthly.display, /UNKNOWN/);
});

await check("budget upsert audited; no default Mason budget invented", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  assert.equal((await e.store.listBudgets()).length, 0);
  await upsertBudget(e, {
    id: "overall-month",
    scope: "overall",
    providerId: null,
    amountUsd: 500,
    period: "month",
    updatedBy: "owner",
  });
  assert.equal((await e.store.listBudgets()).length, 1);
});

await check("UNKNOWN money display never collapses to bare $0 with unknowns", () => {
  const b = moneyBucket();
  addKnown(b, null);
  addKnown(b, null);
  assert.match(displayMoney(b), /UNKNOWN/);
  assert.doesNotMatch(displayMoney(b), /^\$0\.00$/);
});

await check("ingest token hash is not reversible plaintext", () => {
  const token = "pp-ai-cost-test-token-" + "z".repeat(24);
  const hash = hashAiCostIngestToken(token);
  assert.equal(hash.length, 64);
  assert.equal(hash, createHash("sha256").update(token).digest("hex"));
  assert.notEqual(hash, token);
});

await check("0008 reuses 0005 ai_usage rather than replacing it", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/0008_ai_cost_control.sql"), "utf8");
  assert.match(sql, /alter table ai_core\.ai_usage/);
  assert.match(sql, /idempotency_key/);
  assert.doesNotMatch(sql, /drop table ai_core\.ai_usage/i);
  const old = fs.readFileSync(path.join(root, "supabase/migrations/0005_ai_core_ai_usage.sql"), "utf8");
  assert.match(old, /create table if not exists ai_core\.ai_usage/);
});

await check("9b conflicting duplicate rejected", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [{
    idempotencyKey: "conflict-1",
    occurredAt: "2026-08-13T16:00:00.000Z",
    agentId: "mike",
    provider: "xai",
    estimatedCostUsd: 0.1,
  }]);
  const second = await ingestUsageEvents(e, [{
    idempotencyKey: "conflict-1",
    occurredAt: "2026-08-13T16:00:00.000Z",
    agentId: "mike",
    provider: "xai",
    estimatedCostUsd: 9.99,
  }]);
  assert.equal(second.conflicts, 1);
  assert.ok(second.errors.includes("idempotency_conflict"));
  assert.equal((await e.store.listUsage()).length, 1);
  assert.equal((await e.store.listUsage())[0].estimatedCostUsd, 0.1);
});

await check("5b collector cannot read dashboard; owner cookie is not ingest", () => {
  assert.equal(collectorCanReadDashboard(), false);
  const ingestHashEnv = { AI_COST_INGEST_TOKEN_SHA256: hashAiCostIngestToken("collector-only-token-zzzzzzzz") };
  assert.equal(ownerSessionImpersonatesCollector("pp-owner-session", null, ingestHashEnv), false);
  assert.equal(verifyAiCostIngestBearer("Bearer pp-owner-session", ingestHashEnv), false);
  const ingestSrc = fs.readFileSync(path.join(root, "app/api/ai-cost/ingest/route.ts"), "utf8");
  const summarySrc = fs.readFileSync(path.join(root, "app/api/ai-cost/summary/route.ts"), "utf8");
  assert.match(ingestSrc, /verifyAiCostIngestBearer/);
  assert.doesNotMatch(ingestSrc, /requireApiAuth/);
  assert.match(summarySrc, /requireApiAuth\("ai_cost"\)/);
  assert.doesNotMatch(summarySrc, /verifyAiCostIngestBearer/);
});

await check("13b decimal micros arithmetic", () => {
  assert.equal(usdToMicros(0.000001), BigInt(1));
  assert.equal(microsToUsdNumber(BigInt(1)), 0.000001);
  assert.equal(microsToUsdNumber(usdToMicros(25) + usdToMicros(100) + usdToMicros(20) + usdToMicros(99)), 244);
  const tiny = calculateTokenCost({
    inputTokens: 3,
    outputTokens: 1,
    cachedTokens: 0,
    rate: { provider: "xai", model: "grok-4", version: "v1", effectiveFrom: "2026-01-01T00:00:00.000Z", inputPer1m: 1, outputPer1m: 2, cachedPer1m: 0 },
  });
  assert.equal(tiny.amount, 0.000005);
});

await check("17 DST Chicago spring-forward / fall-back", () => {
  const cstMidnight = chicagoLocalToUtc(2026, 3, 8, 0, 0, 0);
  const cdtMidnight = chicagoLocalToUtc(2026, 3, 9, 0, 0, 0);
  assert.equal(cstMidnight.toISOString(), "2026-03-08T06:00:00.000Z");
  assert.equal(cdtMidnight.toISOString(), "2026-03-09T05:00:00.000Z");
  const nov1 = chicagoLocalToUtc(2026, 11, 1, 0, 0, 0);
  assert.equal(nov1.toISOString(), "2026-11-01T05:00:00.000Z");
  assert.equal(chicagoYmd(new Date("2026-03-08T06:30:00.000Z")), "2026-03-08");
});

await check("mid-month subscription proration", () => {
  const monthStart = new Date("2026-08-01T05:00:00.000Z");
  const monthEnd = new Date("2026-09-01T05:00:00.000Z");
  const full = prorateFixedForMonth({
    amount: 310,
    cadence: "monthly",
    effectiveDate: "2026-08-01",
    active: true,
    monthStart,
    monthEnd,
  });
  const mid = prorateFixedForMonth({
    amount: 310,
    cadence: "monthly",
    effectiveDate: "2026-08-16",
    active: true,
    monthStart,
    monthEnd,
  });
  assert.equal(full, 310);
  assert.equal(mid, 160);
});

await check("included-plan usage not counted as metered spend", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  await ingestUsageEvents(e, [
    { idempotencyKey: "inc-1", occurredAt: "2026-08-13T16:00:00.000Z", agentId: "mike", provider: "xai", estimatedCostUsd: 4, usageKind: "included" },
    { idempotencyKey: "ov-1", occurredAt: "2026-08-13T16:01:00.000Z", agentId: "mike", provider: "xai", estimatedCostUsd: 1.5, usageKind: "overage" },
  ]);
  await e.store.recordImportRun({ collectorId: "xai", lastSuccessAt: "2026-08-13T17:00:00.000Z", lastAttemptAt: "2026-08-13T17:00:00.000Z", lastError: null, status: "ok" });
  const summary = await buildExecutiveSummary(e);
  assert.equal(summary.meteredThisMonth.known, 1.5);
});

await check("22 ingest rate limit", () => {
  resetAiCostRateLimitForTests();
  for (let i = 0; i < 30; i++) assert.equal(enforceAiCostIngestLimit("t"), null);
  assert.equal(enforceAiCostIngestLimit("t"), "rate_limited");
  resetAiCostRateLimitForTests();
});

await check("23 oversized ingestion rejected", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  const res = await ingestUsageEvents(e, [{
    idempotencyKey: "big-1",
    occurredAt: "2026-08-13T16:00:00.000Z",
    agentId: "mike",
    provider: "xai",
    estimatedCostUsd: 1,
  }], { payloadBytes: AI_COST_INGEST_MAX_BYTES + 1 });
  assert.equal(res.rejected, 1);
  assert.ok(res.errors.includes("payload_too_large"));
});

await check("26 CSV injection neutralized", () => {
  assert.equal(csvEscape("=cmd|'/c calc'"), `'=cmd|'/c calc'`);
  assert.equal(csvEscape("+1-555"), `'+1-555`);
  assert.equal(csvEscape("-sum(a1)"), `'-sum(a1)`);
  assert.equal(csvEscape("@formula"), `'@formula`);
});

await check("coverage panel present", async () => {
  const e = engine("2026-08-13T18:00:00.000Z");
  const summary = await buildExecutiveSummary(e);
  assert.ok(Array.isArray(summary.coverage));
  assert.ok(summary.coverage.some((c) => c.providerId === "cursor"));
  assert.ok(summary.coverage.every((c) => c.collector !== "live" || c.lastSuccessAt));
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll AI cost usage checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
