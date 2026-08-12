// ============================================================
//  AI Core FOUNDATION acceptance tests.
//  Run:  node --test scripts/foundation/foundation.test.mjs
//  Proves the DB-INDEPENDENT foundation guarantees today. The DB-dependent
//  guarantees (live writes, RLS isolation, unique-index enforcement) are
//  described at the bottom and are gated on DATABASE_URL (B-001) — they are
//  intentionally skipped, not faked.
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sha256Hex, resolveAllowedDomain, decideIngest, canRetry,
  estimateCostUsd, buildUsageRecord,
  constantTimeEqual, resolveWorkerActor, workerCanCreate,
} from "../../lib/foundation-logic.mjs";

// ---- (2) domain isolation (governance) ----
test("domain isolation: identity governs domain; client string is not authorization", () => {
  // owner may act in both domains
  assert.equal(resolveAllowedDomain("owner", { persona: "mike" }), "party_perfect");
  assert.equal(resolveAllowedDomain("owner", { persona: "matter" }), "mershon_personal");
  // employee is confined to party_perfect...
  assert.equal(resolveAllowedDomain("employee", { persona: "mike" }), "party_perfect");
  // ...and CANNOT reach the personal domain even by asking directly
  assert.equal(resolveAllowedDomain("employee", { persona: "matter" }), null);
  assert.equal(resolveAllowedDomain("employee", { domain: "mershon_personal" }), null);
  // unknown/empty requests are refused
  assert.equal(resolveAllowedDomain("employee", { domain: "" }), null);
  assert.equal(resolveAllowedDomain("owner", {}), null);
});

// ---- (PP-010) worker service-auth: dedicated token, server-governed scope ----
test("worker-auth: only the exact token resolves; wrong/empty/malformed -> null", () => {
  const TOKEN = "a".repeat(64);
  assert.equal(constantTimeEqual(TOKEN, TOKEN), true);
  assert.equal(constantTimeEqual(TOKEN, "b".repeat(64)), false);
  assert.equal(constantTimeEqual(TOKEN, TOKEN + "x"), false); // length guard

  assert.notEqual(resolveWorkerActor(TOKEN, { expected: TOKEN }), null);
  assert.equal(resolveWorkerActor("wrong", { expected: TOKEN }), null);
  assert.equal(resolveWorkerActor("", { expected: TOKEN }), null);
  assert.equal(resolveWorkerActor(TOKEN, { expected: "" }), null); // unset server token -> deny
  const id = resolveWorkerActor(TOKEN, { expected: TOKEN });
  assert.equal(id.actorId, "matter-intake-worker");
  assert.deepEqual(id.allowedDomains, ["party_perfect"]);
  assert.deepEqual(id.scopes, ["CREATE_TASK"]);
});

test("worker-auth: server governs domain — mike ok, matter forbidden, no-identity 401", () => {
  const id = resolveWorkerActor("t", { expected: "t" });
  const mike = workerCanCreate(id, "mike");
  assert.equal(mike.ok, true);
  assert.equal(mike.domain, "party_perfect");
  assert.equal(mike.createdBy, "matter-intake-worker"); // never "staff"/"mason"

  const matter = workerCanCreate(id, "matter");
  assert.equal(matter.ok, false);
  assert.equal(matter.status, 403); // mershon_personal not in this worker's allowed domains

  assert.equal(workerCanCreate(null, "mike").status, 401);
});

// ---- (3) same artifact submitted twice processes once ----
test("dedup: identical content submitted twice is processed once, then reused", () => {
  const bytes = Buffer.from("hollyland audio bytes ABC");
  const h = sha256Hex(bytes);
  assert.equal(sha256Hex(Buffer.from("hollyland audio bytes ABC")), h); // stable

  // 1st submit: nothing exists -> store + process
  const first = decideIngest(null);
  assert.equal(first.action, "store-and-process");

  // while it is processing, a duplicate submit must NOT double-store/process
  const midflight = decideIngest({ id: "a1", processing_status: "PROCESSING", retry_count: 0 });
  assert.equal(midflight.action, "attach-wait");

  // after it finishes, a duplicate submit REUSES the result (zero new spend)
  const done = decideIngest({ id: "a1", processing_status: "DONE", processing_result_ref: "blob://transcript/a1" });
  assert.equal(done.action, "reuse");
  assert.equal(done.resultRef, "blob://transcript/a1");
});

// ---- (4) failed jobs can safely retry ----
test("retry: a FAILED artifact retries in place until max, then gives up (no duplicate rows)", () => {
  const failed0 = { id: "a2", processing_status: "FAILED", retry_count: 0 };
  assert.equal(canRetry(failed0), true);
  const r1 = decideIngest(failed0);
  assert.equal(r1.action, "retry");
  assert.equal(r1.retryCount, 1);
  assert.equal(r1.artifactId, "a2"); // same row, not a new one

  const exhausted = { id: "a2", processing_status: "FAILED", retry_count: 3 };
  assert.equal(canRetry(exhausted), false);
  assert.equal(decideIngest(exhausted).action, "give-up");
});

// ---- (5) usage/cost logging records an AI operation ----
test("usage logging: an AI operation is recorded with cost + latency; cache hit = zero spend", () => {
  const dir = mkdtempSync(join(tmpdir(), "aiusage-"));
  const logPath = join(dir, "ai_usage.jsonl");

  const rec = buildUsageRecord({
    domain: "party_perfect", persona: "mike", provider: "xai", model: "grok-default",
    operation: "chat", input_tokens: 1000, output_tokens: 200, cached_tokens: 100,
    latency_ms: 850, success: true, task_id: "task-123",
  });
  // fallback write path (works with NO database)
  writeFileSync(logPath, JSON.stringify(rec) + "\n");
  const back = JSON.parse(readFileSync(logPath, "utf8").trim());

  assert.equal(back.provider, "xai");
  assert.equal(back.operation, "chat");
  assert.equal(back.task_id, "task-123");
  assert.ok(typeof back.at === "string" && back.at.includes("T")); // server-stamped ISO
  assert.ok(back.est_cost_usd > 0); // cost was estimated
  assert.equal(back.latency_ms, 850);

  // expected cost: billedInput=900@2.0 + 200@10.0 + 100 cached@0.5, per 1M
  const expected = (900 * 2.0 + 200 * 10.0 + 100 * 0.5) / 1e6;
  assert.equal(back.est_cost_usd, Math.round(expected * 1e6) / 1e6);

  // cache hit -> zero new spend recorded
  const cached = buildUsageRecord({ domain: "party_perfect", provider: "xai", model: "grok-default", operation: "chat", from_cache: true, input_tokens: 999, output_tokens: 999 });
  assert.equal(cached.est_cost_usd, 0);
  assert.equal(cached.input_tokens, 0);
});

// ---- (6) no secret values appear in logs ----
test("no-secret-leak: bodies/keys/PII cannot reach the usage log", () => {
  const SECRET = "postgresql://postgres.wxyz:SuperSecretPw@aws-0-us-west-2.pooler.supabase.com:6543/postgres";
  const APIKEY = "xai-abcdefghijklmnopqrstuv";
  const rec = buildUsageRecord({
    domain: "party_perfect", provider: "xai", model: "grok-default", operation: "chat",
    input_tokens: 10, output_tokens: 5,
    // hostile extra fields that MUST be dropped:
    prompt: `here is the DB url ${SECRET}`,
    response: "customer PII: John Doe 918-555-1234",
    api_key: APIKEY,
    database_url: SECRET,
    context_refs: [{ id: "doc-1", body: `${SECRET}` }], // object with a body -> coerced to id only
  });
  const serialized = JSON.stringify(rec);
  assert.ok(!serialized.includes(SECRET), "DB URL must not appear");
  assert.ok(!serialized.includes("SuperSecretPw"), "password must not appear");
  assert.ok(!serialized.includes(APIKEY), "api key must not appear");
  assert.ok(!serialized.includes("PII"), "response body must not appear");
  assert.ok(!("prompt" in rec) && !("response" in rec) && !("api_key" in rec) && !("database_url" in rec));
  assert.deepEqual(rec.context_refs, ["doc-1"]); // only the id survived
});

// ---- estimateCost edge cases ----
test("cost: unknown provider/model yields null (never a fabricated number)", () => {
  assert.equal(estimateCostUsd("mystery", "x", { input_tokens: 100 }), null);
  assert.equal(estimateCostUsd("local", "whatever", { input_tokens: 100, output_tokens: 100 }), 0);
});

/* ============================================================
   DB-DEPENDENT acceptance tests — GATED ON B-001 (DATABASE_URL).
   Written and ready; run once the transaction-pooler URL is set:

   (1) AI Core DB writes work:
       - apply 0003/0004/0005, insert a task -> read it back in its domain.
   (2) domain isolation (RLS enforcement):
       - as `authenticated`, select ai_core.tasks where domain='mershon_personal'
         returns 0 rows; service_role sees all.
   (3) dedup enforcement (unique index):
       - insert artifact (domain,sha256); a second insert with the SAME
         (domain,sha256) hits ux_artifacts_domain_sha256 -> upsert returns the
         existing id, no duplicate row; two NULL-sha256 rows both succeed.
   (5) usage row persists:
       - buildUsageRecord -> INSERT ai_core.ai_usage -> select back by task_id.
   These are intentionally NOT executed here (no live DB) and NOT faked.
   ============================================================ */
