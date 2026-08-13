#!/usr/bin/env npx tsx
/**
 * Talk-to-Mike remote intake tests. Synthetic tokens only. No production secrets.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createIntake, completeIntake, intakeStatus, workerAck, workerFail, workerLease } from "../lib/mike-intake";
import { MemoryMikeIntakeStorage, MemoryMikeIntakeStore } from "../lib/mike-intake-memory";
import { sha256Hex } from "../lib/mike-intake-auth";
import {
  logLooksSafe,
  safeIntakeLog,
  type MikeIntakeDevice,
} from "../lib/mike-intake-policy";
import { enforceMikeIntakeCreateLimit, resetMikeIntakeRateLimitForTests } from "../lib/mike-intake-rate-limit";
import type { IntakeDeps } from "../lib/mike-intake";

export {};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const MASON_TOKEN = "test-mason-token-" + "a".repeat(40);
const JOSH_TOKEN = "test-josh-token-" + "b".repeat(40);
const REVOKED_TOKEN = "test-revoked-token-" + "c".repeat(36);
const WORKER_TOKEN = "test-worker-token-" + "d".repeat(40);
const WRONG_TOKEN = "test-wrong-token-" + "e".repeat(40);

const devices: MikeIntakeDevice[] = [
  { senderId: "mason", tokenSha256: sha256Hex(MASON_TOKEN), revoked: false, responseThread: "mike-mason" },
  { senderId: "josh", tokenSha256: sha256Hex(JOSH_TOKEN), revoked: false, responseThread: "mike-josh" },
  { senderId: "mason", tokenSha256: sha256Hex(REVOKED_TOKEN), revoked: true, responseThread: "mike-mason" },
];

function deps(): IntakeDeps & { store: MemoryMikeIntakeStore; storage: MemoryMikeIntakeStorage } {
  const store = new MemoryMikeIntakeStore();
  const storage = new MemoryMikeIntakeStorage();
  return {
    store,
    storage,
    devices,
    env: {
      MIKE_INTAKE_WORKER_TOKEN_SHA256: sha256Hex(WORKER_TOKEN),
    },
    configured: true,
  };
}

function req(url: string, init: RequestInit): Request {
  return new Request(url, init);
}

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

const uuid = () => crypto.randomUUID();

async function main() {
await check("unauthenticated intake", async () => {
  const d = deps();
  const res = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: uuid(), contentType: "audio/mp4", bytes: 1000 }),
    }),
    d,
  );
  assert.equal(res.status, 401);
});

await check("wrong token", async () => {
  const d = deps();
  const res = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: {
        authorization: `Bearer ${WRONG_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ idempotencyKey: uuid(), contentType: "audio/mp4", bytes: 1000 }),
    }),
    d,
  );
  assert.equal(res.status, 401);
});

await check("token in query string rejected", async () => {
  const d = deps();
  const res = await createIntake(
    req(`https://partyperfect.app/api/mike/intake?token=${MASON_TOKEN}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${MASON_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ idempotencyKey: uuid(), contentType: "audio/mp4", bytes: 1000 }),
    }),
    d,
  );
  assert.equal(res.status, 400);
});

await check("revoked token", async () => {
  const d = deps();
  const res = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: {
        authorization: `Bearer ${REVOKED_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ idempotencyKey: uuid(), contentType: "audio/mp4", bytes: 1000 }),
    }),
    d,
  );
  assert.equal(res.status, 403);
});

await check("Mason/Josh separation", async () => {
  const d = deps();
  const key = uuid();
  const created = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: {
        authorization: `Bearer ${MASON_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 2048 }),
    }),
    d,
  );
  assert.equal(created.status, 201);
  const messageId = String(created.body.messageId);
  const joshStatus = await intakeStatus(
    req(`https://partyperfect.app/api/mike/intake/${messageId}`, {
      headers: { authorization: `Bearer ${JOSH_TOKEN}` },
    }),
    messageId,
    d,
  );
  assert.equal(joshStatus.status, 404);
  const masonStatus = await intakeStatus(
    req(`https://partyperfect.app/api/mike/intake/${messageId}`, {
      headers: { authorization: `Bearer ${MASON_TOKEN}` },
    }),
    messageId,
    d,
  );
  assert.equal(masonStatus.status, 200);
  assert.equal(masonStatus.body.status, "RESERVED");
});

await check("idempotent retry same content", async () => {
  const d = deps();
  const key = uuid();
  const body = { idempotencyKey: key, contentType: "audio/mp4", bytes: 3000 };
  const first = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    d,
  );
  const second = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    d,
  );
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.body.messageId, first.body.messageId);
});

await check("key/content conflict", async () => {
  const d = deps();
  const key = uuid();
  await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${JOSH_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 1000 }),
    }),
    d,
  );
  const conflict = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${JOSH_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 2000 }),
    }),
    d,
  );
  assert.equal(conflict.status, 409);
});

await check("oversized audio", async () => {
  const d = deps();
  const res = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: uuid(),
        contentType: "audio/mp4",
        bytes: 21 * 1024 * 1024,
      }),
    }),
    d,
  );
  assert.equal(res.status, 413);
});

await check("invalid media", async () => {
  const d = deps();
  const res = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: uuid(),
        contentType: "application/pdf",
        bytes: 1000,
      }),
    }),
    d,
  );
  assert.equal(res.status, 415);
});

await check("expired upload", async () => {
  const d = deps();
  const created = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: uuid(), contentType: "audio/mp4", bytes: 1500 }),
    }),
    d,
  );
  const messageId = String(created.body.messageId);
  const row = await d.store.getByMessageId(messageId);
  assert.ok(row);
  row.createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  d.storage.put(row.objectPath, 1500, "audio/mp4");
  const done = await completeIntake(
    req("https://partyperfect.app/api/mike/intake/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, idempotencyKey: row.idempotencyKey }),
    }),
    d,
  );
  assert.equal(done.status, 410);
});

await check("missing upload", async () => {
  const d = deps();
  const key = uuid();
  const created = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 1500 }),
    }),
    d,
  );
  const done = await completeIntake(
    req("https://partyperfect.app/api/mike/intake/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId: created.body.messageId, idempotencyKey: key }),
    }),
    d,
  );
  assert.equal(done.status, 409);
  assert.equal(done.body.error, "missing_upload");
});

await check("duplicate complete + queue lease + worker retry + dead letter", async () => {
  const d = deps();
  const key = uuid();
  const created = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${JOSH_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 4096 }),
    }),
    d,
  );
  const messageId = String(created.body.messageId);
  const row = await d.store.getByMessageId(messageId);
  assert.ok(row);
  d.storage.put(row.objectPath, 4096, "audio/mp4");
  const firstComplete = await completeIntake(
    req("https://partyperfect.app/api/mike/intake/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${JOSH_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, idempotencyKey: key, sha256: "abc" }),
    }),
    d,
  );
  const secondComplete = await completeIntake(
    req("https://partyperfect.app/api/mike/intake/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${JOSH_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, idempotencyKey: key }),
    }),
    d,
  );
  assert.equal(firstComplete.status, 202);
  assert.equal(secondComplete.status, 202);
  assert.equal(secondComplete.body.messageId, messageId);

  const deviceLease = await workerLease(
    req("https://partyperfect.app/api/mike/intake/worker/lease", {
      method: "POST",
      headers: { authorization: `Bearer ${JOSH_TOKEN}` },
    }),
    d,
  );
  assert.equal(deviceLease.status, 401);

  const lease1 = await workerLease(
    req("https://partyperfect.app/api/mike/intake/worker/lease", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}` },
    }),
    d,
  );
  assert.equal(lease1.status, 200);
  assert.equal(lease1.body.messageId, messageId);
  assert.equal(lease1.body.attemptCount, 1);

  const fail1 = await workerFail(
    req("https://partyperfect.app/api/mike/intake/worker/fail", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, leaseId: lease1.body.leaseId, reason: "whisper_timeout" }),
    }),
    d,
  );
  assert.equal(fail1.status, 200);
  assert.equal(fail1.body.status, "QUEUED");

  const lease2 = await workerLease(
    req("https://partyperfect.app/api/mike/intake/worker/lease", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}` },
    }),
    d,
  );
  assert.equal(lease2.body.messageId, messageId);
  assert.equal(lease2.body.attemptCount, 2);
  assert.equal(d.store.commands.size, 1, "worker retry must not create another command");

  const dead = await workerFail(
    req("https://partyperfect.app/api/mike/intake/worker/fail", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, leaseId: lease2.body.leaseId, deadLetter: true, reason: "max" }),
    }),
    d,
  );
  assert.equal(dead.body.status, "DEAD_LETTER");
  assert.equal(d.store.commands.size, 1);
});

await check("ack delivered + optional audio delete", async () => {
  const d = deps();
  const key = uuid();
  const created = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 1111 }),
    }),
    d,
  );
  const messageId = String(created.body.messageId);
  const row = await d.store.getByMessageId(messageId);
  assert.ok(row);
  d.storage.put(row.objectPath, 1111, "audio/mp4");
  await completeIntake(
    req("https://partyperfect.app/api/mike/intake/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, idempotencyKey: key }),
    }),
    d,
  );
  const ackLease = await workerLease(
    req("https://partyperfect.app/api/mike/intake/worker/lease", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}` },
    }),
    d,
  );
  const ack = await workerAck(
    req("https://partyperfect.app/api/mike/intake/worker/ack", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, leaseId: ackLease.body.leaseId, deleteAudio: true }),
    }),
    d,
  );
  assert.equal(ack.status, 200);
  assert.equal(ack.body.status, "DELIVERED");
  assert.equal((await d.storage.headObject(row.objectPath)).exists, false);
});

// --- regressions for Codex findings on commit 7772b1e ---

// P1 lease-callback-not-fenced. The worker identity is the fixed string
// "mac-outbound", so lease_owner alone can never distinguish one attempt from
// another. Before the fix, ACK left lease_owner populated and FAIL matched on it,
// so a late or duplicate FAIL flipped a DELIVERED message back to QUEUED and Mason
// received it twice.
await check("stale FAIL cannot resurrect a delivered message", async () => {
  const d = deps();
  const key = uuid();
  const created = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 2048 }),
    }),
    d,
  );
  const messageId = String(created.body.messageId);
  const row = (await d.store.getByMessageId(messageId))!;
  d.storage.put(row.objectPath, 2048, "audio/mp4");
  await completeIntake(
    req("https://partyperfect.app/api/mike/intake/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, idempotencyKey: key }),
    }),
    d,
  );
  const lease = await workerLease(
    req("https://partyperfect.app/api/mike/intake/worker/lease", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}` },
    }),
    d,
  );
  const leaseId = String(lease.body.leaseId);
  assert.ok(leaseId && leaseId !== "undefined", "lease must issue a fencing token");

  const ack = await workerAck(
    req("https://partyperfect.app/api/mike/intake/worker/ack", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, leaseId }),
    }),
    d,
  );
  assert.equal(ack.body.status, "DELIVERED");

  // The exact defect: same worker, same (now consumed) lease token, arriving late.
  const stale = await workerFail(
    req("https://partyperfect.app/api/mike/intake/worker/fail", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, leaseId, reason: "late_timeout" }),
    }),
    d,
  );
  assert.equal(stale.status, 409, "a stale FAIL must be refused, not applied");
  assert.equal(
    (await d.store.getByMessageId(messageId))!.state,
    "DELIVERED",
    "delivered message must stay delivered - re-queueing it would deliver it twice",
  );
});

await check("a lease token from a previous attempt cannot mutate a newer lease", async () => {
  const d = deps();
  const key = uuid();
  const created = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 2048 }),
    }),
    d,
  );
  const messageId = String(created.body.messageId);
  const row = (await d.store.getByMessageId(messageId))!;
  d.storage.put(row.objectPath, 2048, "audio/mp4");
  await completeIntake(
    req("https://partyperfect.app/api/mike/intake/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, idempotencyKey: key }),
    }),
    d,
  );
  const first = await workerLease(
    req("https://partyperfect.app/api/mike/intake/worker/lease", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}` },
    }),
    d,
  );
  const firstLease = String(first.body.leaseId);
  await workerFail(
    req("https://partyperfect.app/api/mike/intake/worker/fail", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, leaseId: firstLease, reason: "retry" }),
    }),
    d,
  );
  const second = await workerLease(
    req("https://partyperfect.app/api/mike/intake/worker/lease", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}` },
    }),
    d,
  );
  const secondLease = String(second.body.leaseId);
  assert.notEqual(firstLease, secondLease, "each lease must get a fresh token");

  const crossed = await workerAck(
    req("https://partyperfect.app/api/mike/intake/worker/ack", {
      method: "POST",
      headers: { authorization: `Bearer ${WORKER_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, leaseId: firstLease }),
    }),
    d,
  );
  assert.equal(crossed.status, 409, "an old lease token must not ack a newer attempt");
  assert.equal((await d.store.getByMessageId(messageId))!.state, "LEASED");
});

await check("ack and fail require a lease token at all", async () => {
  const d = deps();
  for (const [name, fn] of [["ack", workerAck], ["fail", workerFail]] as const) {
    const res = await fn(
      req(`https://partyperfect.app/api/mike/intake/worker/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${WORKER_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ messageId: uuid() }),
      }),
      d,
    );
    assert.equal(res.status, 400, `${name} without a leaseId must be rejected`);
  }
});

// P2 unsupported-mime-queued. normalizeContentType() returns null for an unsupported
// type; the old condition required it to be truthy before comparing, so the whole
// check short-circuited to false and the object was queued anyway.
await check("unsupported stored content type is rejected, not queued", async () => {
  const d = deps();
  const key = uuid();
  const created = await createIntake(
    req("https://partyperfect.app/api/mike/intake", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: key, contentType: "audio/mp4", bytes: 1024 }),
    }),
    d,
  );
  const messageId = String(created.body.messageId);
  const row = (await d.store.getByMessageId(messageId))!;
  // Reserved as audio/mp4, but what actually landed is not an audio type at all.
  d.storage.put(row.objectPath, 1024, "application/x-msdownload");
  const done = await completeIntake(
    req("https://partyperfect.app/api/mike/intake/complete", {
      method: "POST",
      headers: { authorization: `Bearer ${MASON_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messageId, idempotencyKey: key }),
    }),
    d,
  );
  assert.equal(done.status, 415, "an unsupported stored type must be refused");
  assert.notEqual(
    (await d.store.getByMessageId(messageId))!.state,
    "QUEUED",
    "an unsupported object must never reach the worker queue",
  );
});

await check("PII/secret leakage guards", async () => {
  const log = safeIntakeLog({
    messageId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    senderId: "mason",
    state: "QUEUED",
    resultCode: 202,
    latencyMs: 12,
    correlationId: "corr",
  });
  assert.equal(logLooksSafe(log), true);
  assert.equal(
    logLooksSafe({ authorization: "Bearer supersecretvaluehere", transcript: "hello" }),
    false,
  );
  const createSrc = fs.readFileSync(path.join(root, "lib/mike-intake.ts"), "utf8");
  assert.doesNotMatch(createSrc, /OWNER_PIN|TEAM_PASSWORD|DATABASE_URL/);
  const docs = fs.readFileSync(path.join(root, "docs/TALK_TO_MIKE_SHORTCUTS.md"), "utf8");
  assert.match(docs, /\$MIKE_INTAKE_MASON_TOKEN/);
  assert.doesNotMatch(docs, /Bearer [A-Za-z0-9+/=]{20,}/);
});

await check("rate limits", async () => {
  resetMikeIntakeRateLimitForTests();
  for (let i = 0; i < 20; i++) {
    const hit = await enforceMikeIntakeCreateLimit("rate-test");
    assert.equal(hit, null);
  }
  const limited = await enforceMikeIntakeCreateLimit("rate-test");
  assert.equal(limited, "rate_limited");
});

await check("RLS/access SQL denies authenticated on intake tables", () => {
  const sql = fs.readFileSync(
    path.join(root, "supabase/migrations/0007_mike_remote_intake.sql"),
    "utf8",
  );
  assert.match(sql, /revoke all on ai_core\.%I from authenticated/i);
  assert.match(sql, /mike-intake-audio/);
  assert.match(sql, /file_size_limit/);
  assert.match(sql, /unique \(sender_id, idempotency_key\)/);
});

await check("routes are machine-auth gated in source", () => {
  for (const rel of [
    "app/api/mike/intake/route.ts",
    "app/api/mike/intake/complete/route.ts",
    "app/api/mike/intake/[id]/route.ts",
    "app/api/mike/intake/worker/lease/route.ts",
  ]) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /createIntake|completeIntake|intakeStatus|workerLease/);
  }
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nTalk-to-Mike intake checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
