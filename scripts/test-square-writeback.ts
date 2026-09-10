#!/usr/bin/env npx tsx
/**
 * Synthetic Square write-back suite. Mocks fetch. Never calls a real Square account.
 */
import assert from "node:assert/strict";
import { createMemoryTimeStore } from "../lib/time/store";
import { writeBackTimecard, type SquareTimecardShape } from "../lib/time/square-writeback";

export {};

process.env.SQUARE_ENV = "sandbox";
process.env.SQUARE_ACCESS_TOKEN = "test-token";
process.env.SQUARE_LOCATION_ID = "loc-1";
process.env.TIME_SQUARE_SAFE_TEST_TIMECARD_ID = "tc-1";
process.env.TIME_SQUARE_WRITE_ENABLED = "false";
delete process.env.TIME_SQUARE_SAFE_TEST_WRITES_ENABLED;

let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(err);
  }
}

function card(): SquareTimecardShape {
  return {
    id: "tc-1",
    team_member_id: "member-1",
    location_id: "loc-1",
    start_at: "2026-09-10T13:00:00Z",
    end_at: "2026-09-10T21:00:00Z",
    status: "CLOSED",
    breaks: [],
    version: 7,
    updated_at: "2026-09-10T21:00:01Z",
  };
}

type MockOptions = {
  firstPut503?: boolean;
  alwaysPut503?: boolean;
  permanentPut400?: boolean;
  putOkButStaleReadBack?: boolean;
};

function installSquareMock(options?: MockOptions) {
  let state = card();
  let putCount = 0;
  const seenKeys: string[] = [];
  const seen = new Map<string, SquareTimecardShape>();
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string> | undefined;
    const auth = headers?.Authorization || headers?.authorization || "";
    assert.ok(!String(auth).includes("sk-"), "must not leak unrelated secrets into Square auth");
    if ((init?.method || "GET") === "GET") {
      return new Response(JSON.stringify({ timecard: state }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    putCount += 1;
    const body = JSON.parse(String(init?.body || "{}")) as {
      idempotency_key: string;
      timecard: Partial<SquareTimecardShape>;
    };
    seenKeys.push(body.idempotency_key);
    if (options?.alwaysPut503 || (options?.firstPut503 && putCount === 1)) {
      return new Response(JSON.stringify({ errors: [{ detail: "temporary outage" }] }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    if (options?.permanentPut400) {
      return new Response(JSON.stringify({ errors: [{ detail: "invalid break", code: "BAD_REQUEST" }] }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const replay = seen.get(body.idempotency_key);
    if (replay) {
      return new Response(JSON.stringify({ timecard: replay }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (options?.putOkButStaleReadBack) {
      // Square acknowledges PUT but durable state does not reflect the patch.
      const claimed = {
        ...state,
        ...body.timecard,
        id: state.id,
        version: (state.version || 0) + 1,
        updated_at: "2026-09-10T21:05:00Z",
      };
      seen.set(body.idempotency_key, claimed);
      return new Response(JSON.stringify({ timecard: claimed }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    state = {
      ...state,
      ...body.timecard,
      id: state.id,
      version: (state.version || 0) + 1,
      updated_at: "2026-09-10T21:05:00Z",
    };
    seen.set(body.idempotency_key, state);
    return new Response(JSON.stringify({ timecard: state }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return {
    getState: () => state,
    setState: (next: SquareTimecardShape) => {
      state = next;
    },
    getPutCount: () => putCount,
    getSeenKeys: () => seenKeys.slice(),
  };
}

function baseInput() {
  return {
    actorId: "emp-shelly",
    actorCapabilities: ["timekeeping.review" as const],
    correctionId: "correction-1",
    timecardId: "tc-1",
    idempotencyKey: "correction-1:v1",
    reason: "Manager-approved missed clock-out correction",
    expected: {
      version: 7,
      updatedAt: "2026-09-10T21:00:01Z",
      endAt: "2026-09-10T21:00:00Z",
    },
    patch: { endAt: "2026-09-10T21:05:00Z" },
    safeTest: true,
  };
}

function assertNoSecrets(text: string) {
  assert.doesNotMatch(text, /test-token/);
  assert.doesNotMatch(text, /Bearer\s+\S+/i);
  assert.doesNotMatch(text, /SQUARE_ACCESS_TOKEN\s*=\s*\S+/);
}

async function main() {
  await check("employee-only capability cannot write", async () => {
    installSquareMock();
    const store = createMemoryTimeStore();
    const result = await writeBackTimecard(store, {
      ...baseInput(),
      actorCapabilities: ["punch"],
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, "FORBIDDEN");
  });

  await check("production write kill switch blocks non-safe writes", async () => {
    const mock = installSquareMock();
    const store = createMemoryTimeStore();
    process.env.TIME_SQUARE_WRITE_ENABLED = "false";
    const result = await writeBackTimecard(store, { ...baseInput(), safeTest: false });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, "FORBIDDEN");
    assert.equal(mock.getPutCount(), 0);
  });

  await check("safe-test gate rejects non-designated timecard server-side", async () => {
    const mock = installSquareMock();
    const store = createMemoryTimeStore();
    const result = await writeBackTimecard(store, {
      ...baseInput(),
      timecardId: "tc-attacker-chosen",
      safeTest: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, "FORBIDDEN");
    assert.equal(mock.getPutCount(), 0);
  });

  await check("safe test writes once, reads back, and records confirmation audit", async () => {
    const mock = installSquareMock();
    const store = createMemoryTimeStore();
    const result = await writeBackTimecard(store, baseInput());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "CONFIRMED");
      assert.equal(result.timecard.end_at, "2026-09-10T21:05:00Z");
    }
    assert.equal(mock.getPutCount(), 1);
    const audit = await store.listAudit();
    const requested = audit.find((row) => row.action === "square_writeback.requested");
    const confirmed = audit.find((row) => row.action === "square_writeback.confirmed");
    assert.ok(requested);
    assert.ok(confirmed);
    assert.equal(requested!.actor, "emp-shelly");
    assert.equal(requested!.target, "tc-1");
    const requestedDetail = JSON.parse(requested!.detail) as Record<string, unknown>;
    const confirmedDetail = JSON.parse(confirmed!.detail) as Record<string, unknown>;
    assert.equal(requestedDetail.correctionId, "correction-1");
    assert.equal(requestedDetail.reason, "Manager-approved missed clock-out correction");
    assert.ok(requestedDetail.before);
    assert.ok(requestedDetail.patch);
    assert.ok(confirmedDetail.after);
    assert.ok(confirmedDetail.squareConfirmedAt);
    assert.ok(requested!.at);
    assertNoSecrets(JSON.stringify(audit));
    assertNoSecrets(JSON.stringify(result));
  });

  await check("same logical correction is idempotent and does not write twice", async () => {
    const mock = installSquareMock();
    const store = createMemoryTimeStore();
    const first = await writeBackTimecard(store, baseInput());
    assert.equal(first.ok, true);
    const second = await writeBackTimecard(store, baseInput());
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.status, "IDEMPOTENT_REPLAY");
    assert.equal(mock.getPutCount(), 1);
    assert.equal(mock.getState().end_at, "2026-09-10T21:05:00Z");
  });

  await check("changed Square version is rejected as a conflict before PUT", async () => {
    const mock = installSquareMock();
    mock.setState({ ...card(), version: 8, updated_at: "2026-09-10T21:01:00Z" });
    const store = createMemoryTimeStore();
    const result = await writeBackTimecard(store, baseInput());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, "SYNC_CONFLICT");
    assert.equal(mock.getPutCount(), 0);
    const audit = await store.listAudit();
    assert.ok(audit.some((row) => row.action === "square_writeback.conflict"));
  });

  await check("retryable Square failure is retried with the same logical write", async () => {
    const mock = installSquareMock({ firstPut503: true });
    const store = createMemoryTimeStore();
    const result = await writeBackTimecard(store, baseInput());
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.status, "CONFIRMED");
    assert.equal(mock.getPutCount(), 2);
    const keys = mock.getSeenKeys();
    assert.equal(keys.length, 2);
    assert.equal(new Set(keys).size, 1);
    assert.ok(keys[0] && keys[0] === keys[1]);
    const audit = await store.listAudit();
    assert.ok(audit.some((row) => row.action === "square_writeback.retry"));
  });

  await check("retry budget exhaustion stays PENDING_SQUARE_SYNC and never CONFIRMED", async () => {
    const mock = installSquareMock({ alwaysPut503: true });
    const store = createMemoryTimeStore();
    const result = await writeBackTimecard(store, baseInput());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "PENDING_SQUARE_SYNC");
      assert.equal(result.retryable, true);
      assert.equal(result.attempts, 3);
    }
    assert.equal(mock.getPutCount(), 3);
    assert.equal(mock.getState().end_at, "2026-09-10T21:00:00Z");
    const audit = await store.listAudit();
    assert.ok(audit.some((row) => row.action === "square_writeback.failed"));
    assert.ok(!audit.some((row) => row.action === "square_writeback.confirmed"));
  });

  await check("read-back mismatch after PUT is NEEDS_REVIEW not CONFIRMED", async () => {
    const mock = installSquareMock({ putOkButStaleReadBack: true });
    const store = createMemoryTimeStore();
    const result = await writeBackTimecard(store, baseInput());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, "NEEDS_REVIEW");
    assert.equal(mock.getPutCount(), 1);
    assert.equal(mock.getState().end_at, "2026-09-10T21:00:00Z");
    const audit = await store.listAudit();
    assert.ok(audit.some((row) => row.action === "square_writeback.needs_review"));
    assert.ok(!audit.some((row) => row.action === "square_writeback.confirmed"));
  });

  await check("permanent Square 4xx fails once without retry loop", async () => {
    const mock = installSquareMock({ permanentPut400: true });
    const store = createMemoryTimeStore();
    const result = await writeBackTimecard(store, baseInput());
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "FAILED");
      assert.equal(result.retryable, false);
      assert.equal(result.attempts, 1);
    }
    assert.equal(mock.getPutCount(), 1);
    const audit = await store.listAudit();
    assert.ok(audit.some((row) => row.action === "square_writeback.failed"));
    assert.ok(!audit.some((row) => row.action === "square_writeback.retry"));
    assert.ok(!audit.some((row) => row.action === "square_writeback.confirmed"));
  });

  if (failed) {
    console.error(`${failed} Square write-back test(s) failed`);
    process.exit(1);
  }
  console.log("Square write-back tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
