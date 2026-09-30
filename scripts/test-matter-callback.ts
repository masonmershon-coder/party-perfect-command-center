/**
 * Matter callback contract tests (hermetic: in-memory / tmp-dir stores, no network).
 * Run: npx tsx scripts/test-matter-callback.ts
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { CallbackResponseBody, TaskState } from "../lib/matter/callback/contract";
import {
  FixedWindowRateLimiter,
  processMatterCallback,
  type CallbackLogEntry,
  type ProcessorDeps,
} from "../lib/matter/callback/processor";
import { callbackRuntime } from "../lib/matter/callback/runtime";
import { parseKeyRing, signRequest, type KeyRing } from "../lib/matter/callback/signature";
import { FileCallbackStore, MemoryCallbackStore, type CallbackStore, type CommitInput } from "../lib/matter/callback/store";

const MATTER_SECRET = "matter-test-secret-" + "a".repeat(40);
const WORKER_SECRET = "worker-test-secret-" + "b".repeat(40);
const OTHER_SECRET = "other-test-secret-" + "c".repeat(40);
const ALL_SECRETS = [MATTER_SECRET, WORKER_SECRET, OTHER_SECRET];

const ringRaw = JSON.stringify({
  "matter-core": { principal: "matter-core", role: "matter", domains: ["party_perfect"], secret: MATTER_SECRET },
  "worker-codex": { principal: "codex", role: "worker", domains: ["party_perfect"], secret: WORKER_SECRET },
  "worker-other": { principal: "other", role: "worker", domains: ["mershon_personal"], secret: OTHER_SECRET },
});
const ring = parseKeyRing(ringRaw);
if (!ring.ok) throw new Error("test key ring invalid");
const KEYS: KeyRing = ring.keys;
const MATTER = { key_id: "matter-core", secret: MATTER_SECRET };
const WORKER = { key_id: "worker-codex", secret: WORKER_SECRET };
const OTHER = { key_id: "worker-other", secret: OTHER_SECRET };

let passed = 0;
let failed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    failures.push(name);
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: expected ${String(expected)}, got ${String(actual)}`);
}

type Harness = {
  deps: ProcessorDeps;
  logs: CallbackLogEntry[];
  store: CallbackStore;
  clock: { now: number };
};
function harness(store: CallbackStore = new MemoryCallbackStore(), rateLimit = 1000): Harness {
  const logs: CallbackLogEntry[] = [];
  const clock = { now: Date.parse("2026-09-30T15:00:00Z") };
  return {
    logs,
    store,
    clock,
    deps: {
      keys: KEYS,
      store,
      rateLimiter: new FixedWindowRateLimiter(rateLimit),
      log: (e) => logs.push(e),
      nowMs: () => clock.now,
    },
  };
}

let seq = 0;
const nonce = () => randomBytes(12).toString("hex");
type EventInput = Record<string, unknown> & { event_type: string };
function event(h: Harness, e: EventInput): Record<string, unknown> {
  seq += 1;
  return {
    schema_version: 1,
    event_id: `evt-${String(seq).padStart(6, "0")}`,
    idempotency_key: `idem:${String(seq).padStart(6, "0")}`,
    domain: "party_perfect",
    occurred_at: new Date(h.clock.now).toISOString(),
    worker_id: "codex",
    ...e,
  };
}
async function send(
  h: Harness,
  body: Record<string, unknown> | string,
  key: { key_id: string; secret: string } = MATTER,
  opts: { ts?: number; nonce?: string; tamper?: boolean } = {},
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sig = signRequest(key, raw, { timestamp: opts.ts ?? Math.floor(h.clock.now / 1000), nonce: opts.nonce ?? nonce() });
  if (opts.tamper) sig["x-matter-signature"] = sig["x-matter-signature"].replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  const headers = new Headers(sig);
  return { ...(await processMatterCallback(headers, raw, h.deps)), raw, headers };
}
const LEASE = (h: Harness, id = "lease-1") => ({ lease_id: id, expires_at: new Date(h.clock.now + 600_000).toISOString() });
const DIGEST = (c: string) => `sha256:${c.repeat(64)}`;

async function state(h: Harness, taskId: string): Promise<TaskState | undefined> {
  return (await h.store.getTask("party_perfect", taskId))?.state;
}

async function claim(h: Harness, taskId: string, worker = "codex", lease = "lease-1") {
  const r = await send(h, event(h, { event_type: "task_claimed", task_id: taskId, worker_id: worker, lease: LEASE(h, lease) }));
  eq(r.status, 200, `claim ${taskId}`);
  return r;
}
async function toAwaitingVerification(h: Harness, taskId: string) {
  await claim(h, taskId);
  const r = await send(h, event(h, { event_type: "evidence_submitted", task_id: taskId, evidence: { digest: DIGEST("a"), ref: "pr/17#evidence" } }), WORKER);
  eq(r.status, 200, "evidence_submitted");
}

async function main() {
  // 1
  await check("01 valid signed event accepted", async () => {
    const h = harness();
    const r = await claim(h, "PP-1001");
    eq(r.body.ok, true, "ok");
    eq(r.body.code, "ACCEPTED", "code");
    eq(r.body.state, "CLAIMED", "state");
    assert(r.body.audit_id, "audit id present");
    eq(await state(h, "PP-1001"), "CLAIMED", "projection");
  });

  // 2
  await check("02 bad signature rejected", async () => {
    const h = harness();
    const r = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1002", lease: LEASE(h) }), MATTER, { tamper: true });
    eq(r.status, 401, "status");
    eq(r.body.code, "SIGNATURE_INVALID", "code");
    eq(await state(h, "PP-1002"), undefined, "no projection");
    const wrongKey = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1002", lease: LEASE(h) }), { key_id: "matter-core", secret: WORKER_SECRET });
    eq(wrongKey.body.code, "SIGNATURE_INVALID", "signed with another key's secret");
    const unknown = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1002", lease: LEASE(h) }), { key_id: "nobody-key", secret: MATTER_SECRET });
    eq(unknown.body.code, "SIGNATURE_INVALID", "unknown key id");
    const noHeaders = await processMatterCallback(new Headers(), "{}", h.deps);
    eq(noHeaders.body.code, "SIGNATURE_INVALID", "missing headers");
  });

  // 3
  await check("03 old timestamp rejected (and future timestamp)", async () => {
    const h = harness();
    const old = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1003", lease: LEASE(h) }), MATTER, { ts: Math.floor(h.clock.now / 1000) - 301 });
    eq(old.status, 401, "status");
    eq(old.body.code, "TIMESTAMP_OUT_OF_WINDOW", "old");
    eq(old.body.retryable, true, "clock skew is retryable after resync");
    const future = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1003", lease: LEASE(h) }), MATTER, { ts: Math.floor(h.clock.now / 1000) + 301 });
    eq(future.body.code, "TIMESTAMP_OUT_OF_WINDOW", "future");
    const edge = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1003", lease: LEASE(h) }), MATTER, { ts: Math.floor(h.clock.now / 1000) - 299 });
    eq(edge.status, 200, "inside window accepted");
  });

  // 4
  await check("04 replayed request (same nonce) rejected", async () => {
    const h = harness();
    const body = event(h, { event_type: "task_claimed", task_id: "PP-1004", lease: LEASE(h) });
    const n = nonce();
    const first = await send(h, body, MATTER, { nonce: n });
    eq(first.status, 200, "first");
    const replay = await processMatterCallback(first.headers, first.raw, h.deps);
    eq(replay.status, 409, "replay status");
    eq(replay.body.code, "REPLAY_DETECTED", "replay code");
    const audit = await h.store.listAudit();
    eq(audit.filter((a) => a.code === "REPLAY_DETECTED").length, 1, "replay audited");
  });

  // 5
  await check("05 duplicate idempotency key returns original result", async () => {
    const h = harness();
    const body = event(h, { event_type: "task_claimed", task_id: "PP-1005", lease: LEASE(h) });
    const first = await send(h, body);
    const again = await send(h, body); // fresh nonce = legitimate redelivery
    eq(again.status, 200, "status");
    eq(again.body.duplicate, true, "duplicate flag");
    eq(again.body.audit_id, first.body.audit_id, "same audit id as original");
    eq(again.body.state, "CLAIMED", "original state");
    const conflict = await send(h, { ...body, event_id: "evt-conflict1", task_id: "PP-1099" });
    eq(conflict.body.code, "IDEMPOTENCY_CONFLICT", "same key, different body");
    eq(await state(h, "PP-1099"), undefined, "conflict did not create a task");
  });

  // 6
  await check("06 invalid transition rejected", async () => {
    const h = harness();
    await claim(h, "PP-1006");
    const r = await send(h, event(h, { event_type: "verification_passed", task_id: "PP-1006", verifier_id: "claude" }));
    eq(r.status, 409, "status");
    eq(r.body.code, "INVALID_TRANSITION", "code");
    eq(await state(h, "PP-1006"), "CLAIMED", "state unchanged");
    const unknown = await send(h, event(h, { event_type: "evidence_submitted", task_id: "PP-4040", evidence: { digest: DIGEST("b"), ref: "x" } }), WORKER);
    eq(unknown.body.code, "UNKNOWN_TASK", "unknown task");
    const notHolder = await send(h, event(h, { event_type: "heartbeat", task_id: "PP-1006", worker_id: "other" }), MATTER);
    eq(notHolder.body.code, "NOT_LEASE_HOLDER", "non-holder heartbeat");
  });

  // 7
  await check("07 wrong domain rejected", async () => {
    const h = harness();
    const r = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1007", domain: "mershon_personal", lease: LEASE(h) }));
    eq(r.status, 403, "status");
    eq(r.body.code, "DOMAIN_FORBIDDEN", "code");
    const bogus = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1007", domain: "acme", lease: LEASE(h) }));
    eq(bogus.body.code, "SCHEMA_INVALID", "non-AI-Core domain");
    const workerClaim = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1007", lease: LEASE(h) }), WORKER);
    eq(workerClaim.body.code, "ROLE_FORBIDDEN", "worker cannot self-assign");
    const impersonate = await send(h, event(h, { event_type: "worker_failed", worker_id: "claude", reason_code: "CRASH" }), WORKER);
    eq(impersonate.body.code, "ROLE_FORBIDDEN", "worker cannot report for another worker");
    const otherDomainKey = await send(h, event(h, { event_type: "heartbeat", worker_id: "other" }), OTHER);
    eq(otherDomainKey.body.code, "DOMAIN_FORBIDDEN", "key scoped to other domain");
  });

  // 8
  await check("08 malformed body rejected", async () => {
    const h = harness();
    const bad = await send(h, "{not json");
    eq(bad.status, 400, "status");
    eq(bad.body.code, "MALFORMED_JSON", "code");
    const extra = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1008", lease: LEASE(h), grant: "admin" }));
    eq(extra.body.code, "SCHEMA_INVALID", "unknown field");
    const missing = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1008" }));
    eq(missing.body.code, "SCHEMA_INVALID", "missing lease");
    const pathRef = await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1008", lease: LEASE(h), evidence: { digest: DIGEST("c"), ref: "/Users/x/secret.txt" } }));
    eq(pathRef.body.code, "SCHEMA_INVALID", "filesystem path evidence ref");
    assert(!JSON.stringify(pathRef.body).includes("/Users/x"), "value not echoed");
    const array = await send(h, "[]");
    eq(array.body.code, "SCHEMA_INVALID", "array body");
  });

  // 9
  await check("09 oversized request rejected before parsing", async () => {
    const h = harness();
    const big = JSON.stringify({ ...event(h, { event_type: "heartbeat" }), pad: "x".repeat(70_000) });
    const r = await send(h, big);
    eq(r.status, 413, "status");
    eq(r.body.code, "PAYLOAD_TOO_LARGE", "code");
    eq((await h.store.listAudit()).length, 0, "nothing stored for oversized body");
  });

  // 10
  await check("10 audit row written exactly once per accepted event", async () => {
    const h = harness();
    const body = event(h, { event_type: "task_claimed", task_id: "PP-1010", lease: LEASE(h) });
    await send(h, body);
    await send(h, body);
    await send(h, body);
    const accepted = (await h.store.listAudit()).filter((a) => a.event_id === body.event_id && a.outcome === "accepted");
    eq(accepted.length, 1, "one accepted audit row");
    const list = (await h.store.listAudit()) as unknown[];
    let mutated = false;
    try {
      (list as unknown[]).push({});
      mutated = true;
    } catch {
      /* frozen */
    }
    eq(mutated, false, "audit list is immutable to callers");
  });

  // 11
  await check("11 retryable vs permanent failures distinguished; commit failure dead-letters", async () => {
    class FlakyStore extends MemoryCallbackStore {
      failCommit = false;
      async commit(input: CommitInput) {
        if (this.failCommit) throw new Error("simulated store outage");
        return super.commit(input);
      }
    }
    const store = new FlakyStore();
    const h = harness(store);
    store.failCommit = true;
    const body = event(h, { event_type: "task_claimed", task_id: "PP-1011", lease: LEASE(h) });
    const outage = await send(h, body);
    eq(outage.status, 503, "outage status");
    eq(outage.body.code, "STORE_UNAVAILABLE", "outage code");
    eq(outage.body.retryable, true, "outage retryable");
    const dlq = await store.listDeadLetters();
    eq(dlq.length, 1, "dead-lettered once");
    eq(dlq[0].event.event_id, body.event_id, "dead letter carries event id");
    store.failCommit = false;
    const retry = await send(h, body);
    eq(retry.status, 200, "retry after outage succeeds (no idempotency poisoning)");
    const permanent = await send(h, "{bad");
    eq(permanent.body.retryable, false, "malformed is permanent");
    const unknownTask = await send(h, event(h, { event_type: "task_closed", task_id: "PP-4041" }));
    eq(unknownTask.body.retryable, true, "unknown task is retryable (ordering)");
    const limited = harness(new MemoryCallbackStore(), 1);
    await send(limited, event(limited, { event_type: "task_claimed", task_id: "PP-1111", lease: LEASE(limited) }));
    const rl = await send(limited, event(limited, { event_type: "task_claimed", task_id: "PP-1112", lease: LEASE(limited) }));
    eq(rl.status, 429, "rate limited");
    eq(rl.body.retryable, true, "rate limit retryable");
  });

  // 12
  await check("12 secrets absent from responses and logs", async () => {
    const h = harness();
    const bodies: CallbackResponseBody[] = [];
    bodies.push((await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1012", lease: LEASE(h) }))).body);
    bodies.push((await send(h, event(h, { event_type: "task_claimed", task_id: "PP-1013", lease: LEASE(h) }), MATTER, { tamper: true })).body);
    const leak = event(h, { event_type: "worker_failed", reason_code: "CRASH", evidence: { digest: DIGEST("d"), ref: "sk-proj-abcdefghijklmnopqrstuvwxyz" } });
    const leakRes = await send(h, leak, WORKER);
    eq(leakRes.body.code, "SECRET_IN_PAYLOAD", "credential-shaped value refused");
    bodies.push(leakRes.body);
    const blob = JSON.stringify({ bodies, logs: h.logs, audit: await h.store.listAudit() });
    for (const s of ALL_SECRETS) assert(!blob.includes(s), "shared secret leaked");
    assert(!blob.includes("sk-proj-abc"), "submitted credential echoed");
    assert(!blob.includes("x-matter-signature") && !/v1=[a-f0-9]{64}/.test(blob), "signature leaked");
    const badRing = parseKeyRing(JSON.stringify({ "k-one": { principal: "p", role: "matter", domains: ["party_perfect"], secret: "short-secret-value" } }));
    assert(!badRing.ok && !badRing.error.includes("short-secret-value"), "key ring errors never include secret");
  });

  // 13
  await check("13 parallel duplicate delivery creates exactly one effect", async () => {
    const h = harness();
    await claim(h, "PP-1013");
    const body = event(h, { event_type: "evidence_submitted", task_id: "PP-1013", evidence: { digest: DIGEST("e"), ref: "pr/1#e" } });
    const results = await Promise.all(Array.from({ length: 12 }, () => send(h, body, WORKER)));
    eq(results.filter((r) => r.status === 200).length, 12, "all deliveries acknowledged");
    eq(results.filter((r) => !r.body.duplicate).length, 1, "exactly one original");
    const task = await h.store.getTask("party_perfect", "PP-1013");
    eq(task?.version, 2, "projection advanced once (claim + evidence)");
    const accepted = (await h.store.listAudit()).filter((a) => a.event_id === body.event_id && a.outcome === "accepted");
    eq(accepted.length, 1, "one audit row");
    const claims = await Promise.all(
      ["PP-2013", "PP-2013", "PP-2013"].map((t, i) => send(h, event(h, { event_type: "task_claimed", task_id: t, worker_id: `w${i}x`, lease: LEASE(h, `l-${i}`) }))),
    );
    eq(claims.filter((c) => c.status === 200).length, 1, "competing claims: one winner");
    eq(claims.filter((c) => c.body.code === "INVALID_TRANSITION").length, 2, "losers rejected");
  });

  // 14
  await check("14 verification rejection routes to NEEDS_REPAIR", async () => {
    const h = harness();
    await toAwaitingVerification(h, "PP-1014");
    const self = await send(h, event(h, { event_type: "verification_rejected", task_id: "PP-1014", verifier_id: "codex", reason_code: "TESTS_FAILED" }));
    eq(self.body.code, "VERIFIER_NOT_INDEPENDENT", "builder cannot verify own work");
    const r = await send(h, event(h, { event_type: "verification_rejected", task_id: "PP-1014", verifier_id: "claude", reason_code: "TESTS_FAILED" }));
    eq(r.body.state, "NEEDS_REPAIR", "state");
    const t = await h.store.getTask("party_perfect", "PP-1014");
    eq(t?.rejection_reason, "TESTS_FAILED", "rejection reason kept");
    const workerVerify = await send(h, event(h, { event_type: "verification_passed", task_id: "PP-1014", verifier_id: "claude" }), WORKER);
    eq(workerVerify.body.code, "ROLE_FORBIDDEN", "worker key cannot submit verification");
  });

  // 15
  await check("15 repair submission routes back to verification", async () => {
    const h = harness();
    await toAwaitingVerification(h, "PP-1015");
    await send(h, event(h, { event_type: "verification_rejected", task_id: "PP-1015", verifier_id: "claude", reason_code: "LINT" }));
    const early = await send(h, event(h, { event_type: "repair_submitted", task_id: "PP-1015", evidence: { digest: DIGEST("f"), ref: "pr/1#r" } }), WORKER);
    eq(early.body.code, "INVALID_TRANSITION", "must start repair first");
    eq((await send(h, event(h, { event_type: "repair_started", task_id: "PP-1015" }), WORKER)).body.state, "REPAIRING", "repairing");
    const r = await send(h, event(h, { event_type: "repair_submitted", task_id: "PP-1015", evidence: { digest: DIGEST("f"), ref: "pr/1#r" } }), WORKER);
    eq(r.body.state, "AWAITING_VERIFICATION", "back to verification");
    const t = await h.store.getTask("party_perfect", "PP-1015");
    eq(t?.repair_attempts, 1, "repair attempt counted");
    eq(t?.evidence_digest, DIGEST("f"), "new evidence digest");
  });

  // 16
  await check("16 verification pass permits closure (and closure requires pass)", async () => {
    const h = harness();
    await toAwaitingVerification(h, "PP-1016");
    const premature = await send(h, event(h, { event_type: "task_closed", task_id: "PP-1016" }));
    eq(premature.body.code, "INVALID_TRANSITION", "cannot close before pass");
    eq((await send(h, event(h, { event_type: "verification_passed", task_id: "PP-1016", verifier_id: "claude" }))).body.state, "VERIFIED", "verified");
    const closed = await send(h, event(h, { event_type: "task_closed", task_id: "PP-1016" }));
    eq(closed.body.state, "CLOSED", "closed");
  });

  // 17
  await check("17 closed task cannot be reopened by stale events", async () => {
    const h = harness();
    await toAwaitingVerification(h, "PP-1017");
    await send(h, event(h, { event_type: "verification_passed", task_id: "PP-1017", verifier_id: "claude" }));
    await send(h, event(h, { event_type: "task_closed", task_id: "PP-1017" }));
    const stale = [
      { event_type: "task_claimed", task_id: "PP-1017", lease: LEASE(h, "lease-2") },
      { event_type: "heartbeat", task_id: "PP-1017" },
      { event_type: "lease_expired", task_id: "PP-1017" },
      { event_type: "verification_rejected", task_id: "PP-1017", verifier_id: "claude", reason_code: "LATE" },
      { event_type: "task_dead_lettered", task_id: "PP-1017", reason_code: "LATE" },
    ];
    for (const s of stale) {
      const r = await send(h, event(h, s));
      eq(r.body.code, "TASK_TERMINAL", `${s.event_type} after close`);
      eq(r.body.retryable, false, "terminal is permanent");
    }
    eq(await state(h, "PP-1017"), "CLOSED", "still closed");
  });

  await check("extra: file store persists atomically and survives reload", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "matter-cb-"));
    try {
      const h = harness(new FileCallbackStore(dir));
      await claim(h, "PP-3001");
      const reloaded = new FileCallbackStore(dir);
      eq((await reloaded.getTask("party_perfect", "PP-3001"))?.state, "CLAIMED", "reloaded state");
      const mirror = readFileSync(path.join(dir, "CALLBACK_AUDIT.jsonl"), "utf8").trim().split("\n");
      eq(mirror.length, 1, "audit mirror line");
      for (const s of ALL_SECRETS) assert(!readFileSync(path.join(dir, "CALLBACK_STATE.json"), "utf8").includes(s), "secret on disk");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  await check("extra: runtime gate is off by default and in production", () => {
    eq(callbackRuntime({ NODE_ENV: "test" } as NodeJS.ProcessEnv).enabled, false, "default off");
    eq(callbackRuntime({ NODE_ENV: "test", MATTER_CALLBACK_ENABLED: "1", VERCEL_ENV: "production", MATTER_CALLBACK_KEYS: ringRaw } as NodeJS.ProcessEnv).enabled, false, "production off");
    eq(callbackRuntime({ NODE_ENV: "test", MATTER_CALLBACK_ENABLED: "1", MATTER_CALLBACK_KEYS: "{}" } as NodeJS.ProcessEnv).enabled, false, "bad ring off");
    eq(callbackRuntime({ NODE_ENV: "test", MATTER_CALLBACK_ENABLED: "1", VERCEL_ENV: "preview", MATTER_CALLBACK_KEYS: ringRaw } as NodeJS.ProcessEnv).enabled, true, "preview on");
    eq(callbackRuntime({ NODE_ENV: "test", MATTER_CALLBACK_ENABLED: "1", VERCEL: "1", MATTER_CALLBACK_STORE: "file", MATTER_CALLBACK_DIR: "/tmp/x", MATTER_CALLBACK_KEYS: ringRaw } as NodeJS.ProcessEnv).enabled, false, "file store refused on Vercel");
  });

  console.log(`\nmatter-callback: ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log(`failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("matter-callback: harness crashed", e instanceof Error ? e.message : e);
  process.exit(1);
});
