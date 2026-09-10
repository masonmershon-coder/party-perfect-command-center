#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { createMemoryTimeStore } from "../lib/time/store";
import { writeBackTimecard, type SquareTimecardShape } from "../lib/time/square-writeback";

process.env.SQUARE_ENV = "sandbox";
process.env.SQUARE_ACCESS_TOKEN = "test-token";
process.env.SQUARE_LOCATION_ID = "loc-1";
process.env.TIME_SQUARE_SAFE_TEST_TIMECARD_ID = "tc-1";
process.env.TIME_SQUARE_WRITE_ENABLED = "false";

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

function installSquareMock(options?: { firstPut503?: boolean }) {
  let state = card();
  let putCount = 0;
  const seen = new Map<string, SquareTimecardShape>();
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if ((init?.method || "GET") === "GET") {
      return new Response(JSON.stringify({ timecard: state }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    putCount += 1;
    if (options?.firstPut503 && putCount === 1) {
      return new Response(JSON.stringify({ errors: [{ detail: "temporary outage" }] }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    const body = JSON.parse(String(init?.body || "{}")) as {
      idempotency_key: string;
      timecard: Partial<SquareTimecardShape>;
    };
    const replay = seen.get(body.idempotency_key);
    if (replay) {
      return new Response(JSON.stringify({ timecard: replay }), {
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
  assert.ok(audit.some((row) => row.action === "square_writeback.requested"));
  assert.ok(audit.some((row) => row.action === "square_writeback.confirmed"));
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
});

await check("changed Square version is rejected as a conflict before PUT", async () => {
  const mock = installSquareMock();
  mock.setState({ ...card(), version: 8, updated_at: "2026-09-10T21:01:00Z" });
  const store = createMemoryTimeStore();
  const result = await writeBackTimecard(store, baseInput());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, "SYNC_CONFLICT");
  assert.equal(mock.getPutCount(), 0);
});

await check("retryable Square failure is retried with the same logical write", async () => {
  const mock = installSquareMock({ firstPut503: true });
  const store = createMemoryTimeStore();
  const result = await writeBackTimecard(store, baseInput());
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.status, "CONFIRMED");
  assert.equal(mock.getPutCount(), 2);
  const audit = await store.listAudit();
  assert.ok(audit.some((row) => row.action === "square_writeback.retry"));
});

if (failed) {
  console.error(`${failed} Square write-back test(s) failed`);
  process.exit(1);
}
console.log("Square write-back tests passed");
