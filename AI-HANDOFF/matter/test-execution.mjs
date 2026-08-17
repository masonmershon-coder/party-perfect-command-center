#!/usr/bin/env node
// P0-10 FAILURE TESTS for the execution substrate. HERMETIC — runs against a scratch
// MATTER_EXEC_DIR, touches no real state.
//   MATTER_EXEC_DIR=$(mktemp -d) node test-execution.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (!process.env.MATTER_EXEC_DIR) process.env.MATTER_EXEC_DIR = mkdtempSync(path.join(tmpdir(), "matter-exec-"));
const X = await import("./execution.mjs");

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Read a task straight off disk — proves durability rather than trusting in-memory state. */
const task = (id) => JSON.parse(readFileSync(path.join(process.env.MATTER_EXEC_DIR, "LEASES.json"), "utf8")).tasks[id];

await t("1. worker dies mid-task → expired lease is RECLAIMED, never lost", async () => {
  X.enqueue("T-CRASH");
  X.lease("T-CRASH", "worker-a", { ttlSec: 1 });
  assert.equal(task("T-CRASH").state, "LEASED");
  await sleep(1200);
  const r = X.reclaim();
  assert.ok(r.reclaimed.includes("T-CRASH"), "expired lease must be reclaimed");
  assert.equal(task("T-CRASH").state, "QUEUED", "task must return to the eligible queue");
});

await t("2. a live lease BLOCKS a second worker (no duplicate work)", () => {
  X.enqueue("T-DUP");
  X.lease("T-DUP", "worker-b", { ttlSec: 60 });
  assert.throws(() => X.lease("T-DUP", "worker-c", { ttlSec: 60 }), /leased by worker-b/);
});

await t("3. renew keeps a long task alive past its original TTL", async () => {
  X.enqueue("T-LONG");
  const l = X.lease("T-LONG", "worker-d", { ttlSec: 2 });
  await sleep(1000);
  X.renew(l.lease_id, { ttlSec: 60 });
  await sleep(1500);
  const r = X.reclaim();
  assert.ok(!r.reclaimed.includes("T-LONG"), "a renewing worker must not be reclaimed");
  assert.equal(task("T-LONG").state, "LEASED");
});

await t("4. retryable failures requeue, then DEAD-LETTER at the attempt limit", () => {
  X.enqueue("T-RETRY");
  for (let i = 1; i <= X.MAX_ATTEMPTS; i++) {
    const l = X.lease("T-RETRY", `w${i}`, { ttlSec: 60 });
    X.fail(l.lease_id, { reason: `transient ${i}` });
  }
  assert.equal(task("T-RETRY").state, "DEAD_LETTER");
  const dlq = X.readLines(path.join(process.env.MATTER_EXEC_DIR, "DEAD_LETTER.jsonl"));
  const rec = dlq.find((d) => d.task_id === "T-RETRY");
  assert.ok(rec, "must appear in the DLQ");
  assert.equal(rec.kind, "RETRY_LIMIT");
  assert.equal(rec.attempts, X.MAX_ATTEMPTS);
  assert.ok(rec.worker_history.length === X.MAX_ATTEMPTS, "DLQ keeps worker history");
  assert.ok(rec.recommended_recovery, "DLQ record carries a recovery recommendation");
});

await t("5. permanent failure dead-letters immediately (never retried)", () => {
  X.enqueue("T-PERM");
  const l = X.lease("T-PERM", "w1", { ttlSec: 60 });
  X.fail(l.lease_id, { reason: "unsupported operation", permanent: true });
  assert.equal(task("T-PERM").state, "DEAD_LETTER");
  assert.equal(task("T-PERM").attempts, 1, "must not burn extra attempts");
});

await t("6. expired lease at the attempt limit dead-letters instead of looping forever", async () => {
  X.enqueue("T-EXPLIMIT");
  for (let i = 1; i < X.MAX_ATTEMPTS; i++) {
    const l = X.lease("T-EXPLIMIT", `w${i}`, { ttlSec: 60 });
    X.fail(l.lease_id, { reason: "transient" });
  }
  X.lease("T-EXPLIMIT", "wlast", { ttlSec: 1 });
  await sleep(1200);
  const r = X.reclaim();
  assert.ok(r.dead_lettered.includes("T-EXPLIMIT"), "must dead-letter, not loop");
  assert.equal(task("T-EXPLIMIT").state, "DEAD_LETTER");
});

await t("7. approval-gated work parks in WAITING_APPROVAL and is NOT leasable", () => {
  X.enqueue("T-APPROVE");
  X.block("T-APPROVE", "WAITING_APPROVAL", "needs owner approval: POR write");
  assert.equal(task("T-APPROVE").state, "WAITING_APPROVAL");
  assert.throws(() => X.lease("T-APPROVE", "w1"), /WAITING_APPROVAL/);
  X.release("T-APPROVE");
  assert.equal(task("T-APPROVE").state, "QUEUED", "release makes it eligible again");
});

await t("8. idempotency key is stable per attempt (reclaim ≠ duplicate work)", () => {
  const a = X.idempotencyKey("T-IDEM", 1);
  const b = X.idempotencyKey("T-IDEM", 1);
  const c = X.idempotencyKey("T-IDEM", 2);
  assert.equal(a, b, "same attempt must yield the same key");
  assert.notEqual(a, c, "a genuine retry is a new unit of work");
});

await t("9. success is terminal and clears the lease", () => {
  X.enqueue("T-OK");
  const l = X.lease("T-OK", "w1", { ttlSec: 60 });
  X.running(l.lease_id);
  X.complete(l.lease_id, "done with evidence");
  assert.equal(task("T-OK").state, "SUCCEEDED");
  assert.equal(task("T-OK").lease, null);
  assert.throws(() => X.lease("T-OK", "w2"), /terminal/);
});

await t("10. THE INVARIANT — no task is ever silently abandoned", () => {
  const s = X.status();
  assert.deepEqual(s.abandoned, [], `abandoned tasks found: ${JSON.stringify(s.abandoned)}`);
  assert.ok(s.dead_letter_count >= 3, "permanent failures are retained in the DLQ, not lost");
  // every task is in exactly one of: leased, queued, waiting, or terminal
  const accounted = Object.entries(s.byState).filter(([, v]) => v > 0).map(([k]) => k);
  for (const st of accounted) assert.ok(X.STATES.includes(st), `unknown state ${st}`);
});

await t("11. reclaim is safe to run repeatedly (watchdog calls it constantly)", () => {
  const a = X.reclaim(); const b = X.reclaim();
  assert.deepEqual(b.reclaimed, [], "second sweep must find nothing new");
  assert.deepEqual(b.dead_lettered, []);
});

console.log(`\n${pass} passed, ${fail} failed`);
console.log(`scratch: ${process.env.MATTER_EXEC_DIR}`);
process.exit(fail ? 1 : 0);
