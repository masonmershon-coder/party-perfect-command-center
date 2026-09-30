import { randomUUID } from "node:crypto";
import {
  ERROR_CODES,
  MAY_CREATE_TASK,
  REQUIRES_LEASE_HOLDER,
  ROLE_EVENTS,
  TERMINAL_STATES,
  TRANSITIONS,
  type AuditRecord,
  type CallbackErrorCode,
  type CallbackEvent,
  type CallbackResponseBody,
  type TaskProjection,
  type TaskState,
  type WorkerProjection,
} from "./contract";
import { sha256Hex, verifySignature, type CallbackKey, type KeyRing } from "./signature";
import type { CallbackStore } from "./store";
import { validateEvent } from "./validate";

export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
export const DEFAULT_MAX_SKEW_SEC = 300;

/** Redacted log line: identifiers and codes only — never bodies, signatures or secrets. */
export type CallbackLogEntry = {
  level: "info" | "warn" | "error";
  code: CallbackErrorCode | "ACCEPTED" | "DUPLICATE" | "DEAD_LETTERED";
  reason?: string;
  key_id?: string | null;
  principal?: string | null;
  event_id?: string | null;
  event_type?: string | null;
  task_id?: string | null;
};

export interface RateLimiter {
  allow(keyId: string, nowMs: number): boolean;
}

/**
 * Fixed-window limiter per key id. Process-local: on multiple instances each isolate
 * enforces its own window, so a shared Redis counter is required before this is relied
 * on as a global limit (see MATTER-CALLBACK-DESIGN.md).
 */
export class FixedWindowRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly limit: number, private readonly windowMs = 60_000) {}
  allow(keyId: string, nowMs: number) {
    const w = this.windows.get(keyId);
    if (!w || nowMs - w.start >= this.windowMs) {
      this.windows.set(keyId, { start: nowMs, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= this.limit;
  }
}

export type ProcessorDeps = {
  keys: KeyRing;
  store: CallbackStore;
  rateLimiter: RateLimiter;
  log: (entry: CallbackLogEntry) => void;
  nowMs?: () => number;
  maxBodyBytes?: number;
  maxSkewSec?: number;
};

export type ProcessorResult = { status: number; body: CallbackResponseBody };

const locks = new Map<string, Promise<unknown>>();

/** Serialize work per key within this process; each caller waits for the previous holder. */
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => mine);
  locks.set(key, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

function fail(code: CallbackErrorCode, extra: Partial<CallbackResponseBody> = {}): ProcessorResult {
  const { status, retryable } = ERROR_CODES[code];
  return { status, body: { ok: false, code, retryable, ...extra } };
}

function audit(
  base: { received_at: string; body_sha256: string },
  fields: Partial<AuditRecord> & Pick<AuditRecord, "outcome" | "code">,
): AuditRecord {
  return {
    audit_id: randomUUID(),
    key_id: null,
    principal: null,
    event_id: null,
    idempotency_key: null,
    event_type: null,
    domain: null,
    task_id: null,
    worker_id: null,
    from_state: null,
    to_state: null,
    ...base,
    ...fields,
  };
}

/**
 * Process one callback delivery. `rawBody` must be the exact bytes received (signature
 * covers them). Never throws for request problems; store failures dead-letter and
 * return a retryable 503.
 */
export async function processMatterCallback(
  headers: Headers,
  rawBody: string,
  deps: ProcessorDeps,
): Promise<ProcessorResult> {
  const nowMs = deps.nowMs ?? Date.now;
  const now = nowMs();
  const received_at = new Date(now).toISOString();
  const body_sha256 = sha256Hex(rawBody);
  const base = { received_at, body_sha256 };
  const maxBody = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const maxSkew = deps.maxSkewSec ?? DEFAULT_MAX_SKEW_SEC;

  if (Buffer.byteLength(rawBody, "utf8") > maxBody) {
    deps.log({ level: "warn", code: "PAYLOAD_TOO_LARGE" });
    return fail("PAYLOAD_TOO_LARGE");
  }

  const sig = verifySignature(headers, rawBody, deps.keys, Math.floor(now / 1000), maxSkew);
  if (!sig.ok) {
    deps.log({ level: "warn", code: sig.code, reason: sig.reason, key_id: sig.key_id });
    return fail(sig.code);
  }
  const key: CallbackKey = sig.key;
  const who = { key_id: key.key_id, principal: key.principal };

  if (!deps.rateLimiter.allow(key.key_id, now)) {
    deps.log({ level: "warn", code: "RATE_LIMITED", ...who });
    return fail("RATE_LIMITED");
  }

  let fresh: boolean;
  try {
    fresh = await deps.store.recordNonce(`${key.key_id}|${sig.nonce}`, now, now + 2 * maxSkew * 1000);
  } catch {
    deps.log({ level: "error", code: "STORE_UNAVAILABLE", reason: "nonce_store_failed", ...who });
    return fail("STORE_UNAVAILABLE");
  }
  if (!fresh) {
    deps.log({ level: "warn", code: "REPLAY_DETECTED", ...who });
    await safeAudit(deps, audit(base, { outcome: "rejected", code: "REPLAY_DETECTED", ...who }));
    return fail("REPLAY_DETECTED");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    deps.log({ level: "warn", code: "MALFORMED_JSON", ...who });
    await safeAudit(deps, audit(base, { outcome: "rejected", code: "MALFORMED_JSON", ...who }));
    return fail("MALFORMED_JSON");
  }

  const v = validateEvent(parsed, rawBody);
  if (!v.ok) {
    deps.log({ level: "warn", code: v.code, ...who });
    await safeAudit(deps, audit(base, { outcome: "rejected", code: v.code, ...who }));
    return fail(v.code, { errors: v.errors });
  }
  const ev = v.event;
  const evFields = {
    ...who,
    event_id: ev.event_id,
    idempotency_key: ev.idempotency_key,
    event_type: ev.event_type,
    domain: ev.domain,
    task_id: ev.task_id ?? null,
    worker_id: ev.worker_id,
  };
  const ids = { event_id: ev.event_id, ...(ev.task_id ? { task_id: ev.task_id } : {}) };
  const reject = async (code: CallbackErrorCode, from_state: TaskState | null = null, reason?: string) => {
    deps.log({ level: "warn", code, reason, ...who, event_id: ev.event_id, event_type: ev.event_type, task_id: ev.task_id ?? null });
    await safeAudit(deps, audit(base, { outcome: "rejected", code, ...evFields, from_state }));
    return fail(code, ids);
  };

  if (!key.domains.includes(ev.domain)) return reject("DOMAIN_FORBIDDEN", null, "domain_not_allowed_for_key");
  if (!ROLE_EVENTS[key.role].has(ev.event_type)) return reject("ROLE_FORBIDDEN", null, "event_not_allowed_for_role");
  if (key.role === "worker" && key.principal !== ev.worker_id) {
    return reject("ROLE_FORBIDDEN", null, "worker_key_cannot_report_for_other_worker");
  }

  const scope = `${ev.domain}|${ev.idempotency_key}`;
  const lockKey = ev.task_id ? `task|${ev.domain}|${ev.task_id}` : `worker|${ev.worker_id}`;

  return withLock(lockKey, async () => {
    let prior;
    try {
      prior = await deps.store.getIdempotent(scope);
    } catch {
      deps.log({ level: "error", code: "STORE_UNAVAILABLE", reason: "idempotency_read_failed", ...who, event_id: ev.event_id });
      return fail("STORE_UNAVAILABLE", ids);
    }
    if (prior) {
      if (prior.body_sha256 !== body_sha256) return reject("IDEMPOTENCY_CONFLICT", null, "same_key_different_body");
      deps.log({ level: "info", code: "DUPLICATE", ...who, event_id: ev.event_id, task_id: ev.task_id ?? null });
      return { status: prior.status, body: { ...prior.response, duplicate: true } };
    }

    const decision = await decide(ev, deps);
    if (!decision.ok) return reject(decision.code, decision.from, decision.reason);

    const response: CallbackResponseBody = {
      ok: true,
      code: "ACCEPTED",
      retryable: false,
      ...ids,
      ...(decision.task ? { state: decision.task.state } : {}),
    };
    const auditRow = audit(base, {
      outcome: "accepted",
      code: "ACCEPTED",
      ...evFields,
      from_state: decision.from,
      to_state: decision.task?.state ?? null,
    });
    response.audit_id = auditRow.audit_id;

    try {
      await deps.store.commit({
        idempotency: { scope, body_sha256, status: 200, response, recorded_at: received_at },
        audit: auditRow,
        task: decision.task,
        worker: decision.worker,
      });
    } catch {
      deps.log({ level: "error", code: "STORE_UNAVAILABLE", reason: "commit_failed", ...who, event_id: ev.event_id, task_id: ev.task_id ?? null });
      try {
        await deps.store.deadLetter({ dlq_id: randomUUID(), failed_at: received_at, reason: "commit_failed", attempts: 1, event: ev });
        deps.log({ level: "warn", code: "DEAD_LETTERED", ...who, event_id: ev.event_id });
      } catch {
        deps.log({ level: "error", code: "STORE_UNAVAILABLE", reason: "dead_letter_failed", ...who, event_id: ev.event_id });
      }
      return fail("STORE_UNAVAILABLE", ids);
    }
    deps.log({ level: "info", code: "ACCEPTED", ...who, event_id: ev.event_id, event_type: ev.event_type, task_id: ev.task_id ?? null });
    return { status: 200, body: response };
  });
}

async function safeAudit(deps: ProcessorDeps, record: AuditRecord) {
  try {
    await deps.store.appendAudit(record);
  } catch {
    deps.log({ level: "error", code: "STORE_UNAVAILABLE", reason: "audit_append_failed", key_id: record.key_id });
  }
}

type Decision =
  | { ok: true; from: TaskState | null; task?: TaskProjection; worker?: WorkerProjection }
  | { ok: false; code: CallbackErrorCode; from: TaskState | null; reason: string };

async function decide(ev: CallbackEvent, deps: ProcessorDeps): Promise<Decision> {
  const at = ev.occurred_at;

  if (ev.event_type === "worker_registered") {
    const prev = await deps.store.getWorker(ev.worker_id);
    return {
      ok: true,
      from: null,
      worker: {
        worker_id: ev.worker_id,
        domain: ev.domain,
        capabilities_declared: [...(ev.capabilities ?? [])].sort(),
        registered_at: prev?.registered_at ?? at,
        last_heartbeat_at: prev?.last_heartbeat_at ?? null,
        last_failure_code: prev?.last_failure_code ?? null,
        updated_at: at,
      },
    };
  }

  const worker = await deps.store.getWorker(ev.worker_id);

  if (!ev.task_id) {
    if (!worker) return { ok: false, code: "UNKNOWN_WORKER", from: null, reason: "worker_not_registered" };
    const next = { ...worker, updated_at: at };
    if (ev.event_type === "heartbeat") next.last_heartbeat_at = at;
    if (ev.event_type === "worker_failed") next.last_failure_code = ev.reason_code ?? null;
    return { ok: true, from: null, worker: next };
  }

  const existing = await deps.store.getTask(ev.domain, ev.task_id);
  if (!existing && !MAY_CREATE_TASK.has(ev.event_type)) {
    return { ok: false, code: "UNKNOWN_TASK", from: null, reason: "task_not_in_projection" };
  }
  const from: TaskState = existing?.state ?? "QUEUED";
  if (TERMINAL_STATES.has(from)) return { ok: false, code: "TASK_TERMINAL", from, reason: "task_is_terminal" };

  const rule = TRANSITIONS[ev.event_type as keyof typeof TRANSITIONS];
  if (!rule.from.includes(from)) return { ok: false, code: "INVALID_TRANSITION", from, reason: `${ev.event_type}_not_allowed_from_${from}` };

  if (REQUIRES_LEASE_HOLDER.has(ev.event_type) && existing?.assigned_worker !== ev.worker_id) {
    return { ok: false, code: "NOT_LEASE_HOLDER", from, reason: "worker_does_not_hold_task" };
  }
  if ((ev.event_type === "verification_rejected" || ev.event_type === "verification_passed") && ev.verifier_id === existing?.assigned_worker) {
    return { ok: false, code: "VERIFIER_NOT_INDEPENDENT", from, reason: "verifier_equals_builder" };
  }
  if (ev.lease && existing?.lease_id && ev.event_type === "heartbeat" && ev.lease.lease_id !== existing.lease_id) {
    return { ok: false, code: "NOT_LEASE_HOLDER", from, reason: "lease_id_mismatch" };
  }

  const to = rule.to(from);
  const t: TaskProjection = existing
    ? { ...existing }
    : {
        task_id: ev.task_id,
        domain: ev.domain,
        message_id: ev.message_id ?? null,
        state: "QUEUED",
        assigned_worker: null,
        verifier_id: null,
        lease_id: null,
        lease_expires_at: null,
        attempts: 0,
        retries: 0,
        repair_attempts: 0,
        evidence_digest: null,
        evidence_ref: null,
        rejection_reason: null,
        failure_reason: null,
        dead_letter_reason: null,
        last_event_id: ev.event_id,
        last_event_type: ev.event_type,
        last_event_at: at,
        version: 0,
        created_at: at,
        updated_at: at,
      };

  switch (ev.event_type) {
    case "task_claimed":
      t.assigned_worker = ev.worker_id;
      t.lease_id = ev.lease!.lease_id;
      t.lease_expires_at = ev.lease!.expires_at;
      t.attempts += 1;
      if (t.attempts > 1) t.retries += 1;
      if (ev.message_id) t.message_id = ev.message_id;
      break;
    case "heartbeat":
      if (ev.lease) t.lease_expires_at = ev.lease.expires_at;
      break;
    case "evidence_submitted":
    case "repair_submitted":
      t.evidence_digest = ev.evidence!.digest;
      t.evidence_ref = ev.evidence!.ref;
      break;
    case "verification_rejected":
      t.verifier_id = ev.verifier_id ?? null;
      t.rejection_reason = ev.reason_code ?? null;
      break;
    case "repair_started":
      t.repair_attempts += 1;
      break;
    case "verification_passed":
      t.verifier_id = ev.verifier_id ?? null;
      t.rejection_reason = null;
      break;
    case "task_closed":
      t.lease_id = null;
      t.lease_expires_at = null;
      break;
    case "worker_failed":
    case "lease_expired":
      t.failure_reason = ev.reason_code ?? (ev.event_type === "lease_expired" ? "LEASE_EXPIRED" : null);
      t.assigned_worker = null;
      t.lease_id = null;
      t.lease_expires_at = null;
      break;
    case "task_dead_lettered":
      t.dead_letter_reason = ev.reason_code ?? null;
      t.lease_id = null;
      t.lease_expires_at = null;
      break;
  }
  t.state = to;
  t.last_event_id = ev.event_id;
  t.last_event_type = ev.event_type;
  t.last_event_at = at;
  t.version += 1;
  t.updated_at = at;

  let nextWorker: WorkerProjection | undefined;
  if (worker && (ev.event_type === "heartbeat" || ev.event_type === "worker_failed")) {
    nextWorker = {
      ...worker,
      updated_at: at,
      ...(ev.event_type === "heartbeat" ? { last_heartbeat_at: at } : { last_failure_code: ev.reason_code ?? null }),
    };
  }
  return { ok: true, from: existing ? from : null, task: t, worker: nextWorker };
}
