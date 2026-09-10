import { sha256Hex } from "@/lib/time/auth";
import type { TimeCapability, TimeAudit } from "@/lib/time/types";
import type { TimeStore } from "@/lib/time/store";

const DEFAULT_SQUARE_VERSION = "2026-08-19";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export type SquareBreakPatch = {
  id?: string;
  break_type_id?: string;
  start_at?: string;
  end_at?: string | null;
  name?: string;
  expected_duration?: string;
  is_paid?: boolean;
};

export type SquareTimecardShape = {
  id: string;
  team_member_id?: string;
  location_id?: string;
  start_at?: string;
  end_at?: string | null;
  status?: "OPEN" | "CLOSED";
  breaks?: SquareBreakPatch[];
  wage?: unknown;
  declared_cash_tip_money?: unknown;
  version?: number;
  created_at?: string;
  updated_at?: string;
};

export type TimecardPatch = {
  startAt?: string;
  endAt?: string | null;
  breaks?: SquareBreakPatch[];
};

export type TimecardExpectation = {
  version?: number;
  updatedAt?: string;
  startAt?: string;
  endAt?: string | null;
  breaks?: SquareBreakPatch[];
};

export type SquareWritebackInput = {
  actorId: string;
  actorCapabilities: TimeCapability[];
  correctionId: string;
  timecardId: string;
  idempotencyKey: string;
  reason: string;
  expected: TimecardExpectation;
  patch: TimecardPatch;
  safeTest?: boolean;
};

export type SquareWritebackResult =
  | {
      ok: true;
      status: "CONFIRMED" | "IDEMPOTENT_REPLAY";
      timecard: SquareTimecardShape;
      squareIdempotencyKey: string;
      attempts: number;
    }
  | {
      ok: false;
      status:
        | "NOT_CONFIGURED"
        | "FORBIDDEN"
        | "INVALID_REQUEST"
        | "SYNC_CONFLICT"
        | "PENDING_SQUARE_SYNC"
        | "FAILED"
        | "NEEDS_REVIEW";
      error: string;
      retryable: boolean;
      attempts: number;
      current?: SquareTimecardShape;
    };

type SquareResponse<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; retryable: boolean };

function squareBase() {
  return process.env.SQUARE_ENV === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";
}

function squareVersion() {
  return process.env.SQUARE_API_VERSION?.trim() || DEFAULT_SQUARE_VERSION;
}

function configured(): string[] {
  const missing: string[] = [];
  if (!process.env.SQUARE_ACCESS_TOKEN?.trim()) missing.push("SQUARE_ACCESS_TOKEN");
  if (!process.env.SQUARE_LOCATION_ID?.trim()) missing.push("SQUARE_LOCATION_ID");
  return missing;
}

export function canWriteSquareTimecards(capabilities: TimeCapability[]): boolean {
  // Employees have punch/self-service capabilities only. Management corrections require review authority.
  return capabilities.includes("timekeeping.review");
}

function validateIso(value: string | null | undefined, name: string): string | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return `${name} must be a valid ISO/RFC3339 timestamp`;
  return null;
}

function validateInput(input: SquareWritebackInput): string | null {
  if (!input.correctionId?.trim()) return "correctionId is required";
  if (!input.timecardId?.trim()) return "timecardId is required";
  if (!input.idempotencyKey?.trim()) return "idempotencyKey is required";
  if (input.idempotencyKey.length > 256) return "idempotencyKey is too long";
  if (!input.reason?.trim()) return "reason is required";
  if (!input.expected || Object.keys(input.expected).length === 0) {
    return "expected snapshot/version is required for conflict protection";
  }
  if (!input.patch || Object.keys(input.patch).length === 0) return "patch is required";
  for (const [name, value] of [
    ["patch.startAt", input.patch.startAt],
    ["patch.endAt", input.patch.endAt],
    ["expected.startAt", input.expected.startAt],
    ["expected.endAt", input.expected.endAt],
    ["expected.updatedAt", input.expected.updatedAt],
  ] as const) {
    const err = validateIso(value, name);
    if (err) return err;
  }
  if (input.patch.startAt && input.patch.endAt) {
    if (Date.parse(input.patch.endAt) <= Date.parse(input.patch.startAt)) {
      return "endAt must be after startAt";
    }
  }
  return null;
}

function stableBreaks(breaks: SquareBreakPatch[] | undefined) {
  return (breaks || []).map((b) => ({
    id: b.id || null,
    break_type_id: b.break_type_id || null,
    start_at: b.start_at || null,
    end_at: b.end_at ?? null,
    name: b.name || null,
    expected_duration: b.expected_duration || null,
    is_paid: b.is_paid ?? null,
  }));
}

function snapshot(card: SquareTimecardShape) {
  return {
    version: card.version ?? null,
    updatedAt: card.updated_at ?? null,
    startAt: card.start_at ?? null,
    endAt: card.end_at ?? null,
    breaks: stableBreaks(card.breaks),
  };
}

function expectationMatches(card: SquareTimecardShape, expected: TimecardExpectation): boolean {
  if (expected.version != null && card.version !== expected.version) return false;
  if (expected.updatedAt != null && card.updated_at !== expected.updatedAt) return false;
  if (expected.startAt !== undefined && card.start_at !== expected.startAt) return false;
  if (expected.endAt !== undefined && (card.end_at ?? null) !== expected.endAt) return false;
  if (expected.breaks !== undefined) {
    if (JSON.stringify(stableBreaks(card.breaks)) !== JSON.stringify(stableBreaks(expected.breaks))) return false;
  }
  return true;
}

function patchMatches(card: SquareTimecardShape, patch: TimecardPatch): boolean {
  if (patch.startAt !== undefined && card.start_at !== patch.startAt) return false;
  if (patch.endAt !== undefined && (card.end_at ?? null) !== patch.endAt) return false;
  if (patch.breaks !== undefined) {
    if (JSON.stringify(stableBreaks(card.breaks)) !== JSON.stringify(stableBreaks(patch.breaks))) return false;
  }
  return true;
}

function writableTimecard(current: SquareTimecardShape, patch: TimecardPatch) {
  const out: Record<string, unknown> = {
    team_member_id: current.team_member_id,
    location_id: current.location_id,
    start_at: patch.startAt !== undefined ? patch.startAt : current.start_at,
    end_at: patch.endAt !== undefined ? patch.endAt : current.end_at,
    breaks: patch.breaks !== undefined ? patch.breaks : current.breaks,
  };
  // Preserve payroll-related fields without exposing them to the correction patch.
  if (current.wage !== undefined) out.wage = current.wage;
  if (current.declared_cash_tip_money !== undefined) out.declared_cash_tip_money = current.declared_cash_tip_money;
  if (current.version !== undefined) out.version = current.version;
  return out;
}

async function squareRequest<T>(method: "GET" | "PUT", path: string, body?: unknown): Promise<SquareResponse<T>> {
  const token = process.env.SQUARE_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, status: 0, error: "SQUARE_ACCESS_TOKEN missing", retryable: false };
  try {
    const res = await fetch(`${squareBase()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Square-Version": squareVersion(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T & {
      errors?: Array<{ detail?: string; code?: string }>;
    };
    if (!res.ok) {
      const error = data.errors?.map((e) => e.detail || e.code).filter(Boolean).join("; ") || `Square HTTP ${res.status}`;
      return { ok: false, status: res.status, error, retryable: RETRYABLE.has(res.status) };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      retryable: true,
    };
  }
}

export async function retrieveSquareTimecard(id: string): Promise<SquareResponse<{ timecard?: SquareTimecardShape }>> {
  return squareRequest("GET", `/v2/labor/timecards/${encodeURIComponent(id)}`);
}

async function updateSquareTimecard(
  id: string,
  timecard: Record<string, unknown>,
  idempotencyKey: string,
): Promise<SquareResponse<{ timecard?: SquareTimecardShape }>> {
  return squareRequest("PUT", `/v2/labor/timecards/${encodeURIComponent(id)}`, {
    idempotency_key: idempotencyKey,
    timecard,
  });
}

function auditDetail(value: Record<string, unknown>) {
  return JSON.stringify(value);
}

async function appendAudit(store: TimeStore, actor: string, action: string, target: string, detail: Record<string, unknown>) {
  await store.appendAudit({ at: new Date().toISOString(), actor, action, target, detail: auditDetail(detail) });
}

function parseDetail(row: TimeAudit): Record<string, unknown> | null {
  try {
    return JSON.parse(row.detail) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function findConfirmedReplay(store: TimeStore, idempotencyHash: string, correctionId: string) {
  const rows = await store.listAudit();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.action !== "square_writeback.confirmed") continue;
    const detail = parseDetail(row);
    if (detail?.idempotencyHash === idempotencyHash && detail?.correctionId === correctionId) return detail;
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function writeBackTimecard(store: TimeStore, input: SquareWritebackInput): Promise<SquareWritebackResult> {
  const missing = configured();
  if (missing.length) {
    return { ok: false, status: "NOT_CONFIGURED", error: `Missing ${missing.join(", ")}`, retryable: false, attempts: 0 };
  }
  if (!canWriteSquareTimecards(input.actorCapabilities)) {
    return { ok: false, status: "FORBIDDEN", error: "Management timekeeping.review capability is required", retryable: false, attempts: 0 };
  }
  const invalid = validateInput(input);
  if (invalid) return { ok: false, status: "INVALID_REQUEST", error: invalid, retryable: false, attempts: 0 };

  const production = process.env.SQUARE_ENV !== "sandbox";
  const writesEnabled = process.env.TIME_SQUARE_WRITE_ENABLED === "true";
  const safeTestId = process.env.TIME_SQUARE_SAFE_TEST_TIMECARD_ID?.trim();
  const safeTestWritesEnabled = process.env.TIME_SQUARE_SAFE_TEST_WRITES_ENABLED === "true";

  if (input.safeTest) {
    if (!safeTestId || input.timecardId !== safeTestId) {
      return { ok: false, status: "FORBIDDEN", error: "Safe test is restricted to TIME_SQUARE_SAFE_TEST_TIMECARD_ID", retryable: false, attempts: 0 };
    }
    if (production && !safeTestWritesEnabled) {
      return { ok: false, status: "FORBIDDEN", error: "Production safe-test writes require TIME_SQUARE_SAFE_TEST_WRITES_ENABLED=true", retryable: false, attempts: 0 };
    }
  } else if (!writesEnabled) {
    return { ok: false, status: "FORBIDDEN", error: "Square write-back is disabled; set TIME_SQUARE_WRITE_ENABLED=true after verification", retryable: false, attempts: 0 };
  }

  const idempotencyHash = sha256Hex(`pp-time:${input.idempotencyKey}`);
  const squareIdempotencyKey = idempotencyHash.slice(0, 64);
  const prior = await findConfirmedReplay(store, idempotencyHash, input.correctionId);
  if (prior) {
    const read = await retrieveSquareTimecard(input.timecardId);
    if (read.ok && read.data.timecard && patchMatches(read.data.timecard, input.patch)) {
      await appendAudit(store, input.actorId, "square_writeback.idempotent_replay", input.timecardId, {
        correctionId: input.correctionId,
        idempotencyHash,
      });
      return { ok: true, status: "IDEMPOTENT_REPLAY", timecard: read.data.timecard, squareIdempotencyKey, attempts: 0 };
    }
    return { ok: false, status: "NEEDS_REVIEW", error: "A confirmed idempotent write exists but Square no longer matches it", retryable: false, attempts: 0, current: read.ok ? read.data.timecard : undefined };
  }

  const before = await retrieveSquareTimecard(input.timecardId);
  if (!before.ok || !before.data.timecard) {
    return { ok: false, status: before.ok ? "FAILED" : before.retryable ? "PENDING_SQUARE_SYNC" : "FAILED", error: before.ok ? "Square returned no timecard" : before.error, retryable: before.ok ? false : before.retryable, attempts: 0 };
  }
  const current = before.data.timecard;
  if (!expectationMatches(current, input.expected)) {
    await appendAudit(store, input.actorId, "square_writeback.conflict", input.timecardId, {
      correctionId: input.correctionId,
      idempotencyHash,
      expected: input.expected,
      current: snapshot(current),
    });
    return { ok: false, status: "SYNC_CONFLICT", error: "Square changed after Party Perfect loaded this timecard", retryable: false, attempts: 0, current };
  }

  await appendAudit(store, input.actorId, "square_writeback.requested", input.timecardId, {
    correctionId: input.correctionId,
    idempotencyHash,
    reason: input.reason,
    before: snapshot(current),
    patch: input.patch,
    safeTest: Boolean(input.safeTest),
  });

  let lastError = "Unknown Square write failure";
  let lastRetryable = false;
  let attemptsUsed = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    attemptsUsed = attempt;
    // Re-read immediately before each attempt. If another actor changed Square, stop.
    const fresh = await retrieveSquareTimecard(input.timecardId);
    if (!fresh.ok || !fresh.data.timecard) {
      lastError = fresh.ok ? "Square returned no timecard" : fresh.error;
      lastRetryable = !fresh.ok && fresh.retryable;
    } else if (!expectationMatches(fresh.data.timecard, input.expected)) {
      await appendAudit(store, input.actorId, "square_writeback.conflict", input.timecardId, {
        correctionId: input.correctionId,
        idempotencyHash,
        attempt,
        expected: input.expected,
        current: snapshot(fresh.data.timecard),
      });
      return { ok: false, status: "SYNC_CONFLICT", error: "Square changed before write; no update was applied", retryable: false, attempts: attempt - 1, current: fresh.data.timecard };
    } else {
      await appendAudit(store, input.actorId, "square_writeback.attempt", input.timecardId, {
        correctionId: input.correctionId,
        idempotencyHash,
        attempt,
      });
      const update = await updateSquareTimecard(
        input.timecardId,
        writableTimecard(fresh.data.timecard, input.patch),
        squareIdempotencyKey,
      );
      if (update.ok) {
        const readBack = await retrieveSquareTimecard(input.timecardId);
        if (readBack.ok && readBack.data.timecard && patchMatches(readBack.data.timecard, input.patch)) {
          await appendAudit(store, input.actorId, "square_writeback.confirmed", input.timecardId, {
            correctionId: input.correctionId,
            idempotencyHash,
            reason: input.reason,
            before: snapshot(current),
            after: snapshot(readBack.data.timecard),
            squareConfirmedAt: new Date().toISOString(),
            attempt,
            safeTest: Boolean(input.safeTest),
          });
          return { ok: true, status: "CONFIRMED", timecard: readBack.data.timecard, squareIdempotencyKey, attempts: attempt };
        }
        const readError = readBack.ok ? "Square read-back did not match requested correction" : readBack.error;
        await appendAudit(store, input.actorId, "square_writeback.needs_review", input.timecardId, {
          correctionId: input.correctionId,
          idempotencyHash,
          attempt,
          error: readError,
          observed: readBack.ok && readBack.data.timecard ? snapshot(readBack.data.timecard) : null,
        });
        return { ok: false, status: "NEEDS_REVIEW", error: readError, retryable: !readBack.ok && readBack.retryable, attempts: attempt, current: readBack.ok ? readBack.data.timecard : undefined };
      }
      lastError = update.error;
      lastRetryable = update.retryable;
      if (!update.retryable) break;
    }
    if (attempt < MAX_ATTEMPTS && lastRetryable) {
      await appendAudit(store, input.actorId, "square_writeback.retry", input.timecardId, {
        correctionId: input.correctionId,
        idempotencyHash,
        attempt,
        error: lastError,
      });
      await sleep(200 * 2 ** (attempt - 1));
    }
  }

  await appendAudit(store, input.actorId, "square_writeback.failed", input.timecardId, {
    correctionId: input.correctionId,
    idempotencyHash,
    error: lastError,
    retryable: lastRetryable,
    attempts: attemptsUsed,
  });
  return {
    ok: false,
    status: lastRetryable ? "PENDING_SQUARE_SYNC" : "FAILED",
    error: lastError,
    retryable: lastRetryable,
    attempts: attemptsUsed,
  };
}
