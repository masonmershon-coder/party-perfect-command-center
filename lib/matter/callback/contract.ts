/**
 * Matter callback contract — event names, lifecycle states, transition matrix,
 * role permissions and error codes.
 *
 * Matter / AI Core is the task authority. This contract only lets Command Center
 * record events Matter (or a lease-holding worker) reports, and refuse events that
 * are impossible from the recorded state. It never routes, grants or certifies.
 * GitHub comments are evidence/transport only and never feed this state.
 */

export const CALLBACK_SCHEMA_VERSION = 1 as const;

export const TASK_EVENTS = [
  "task_claimed",
  "heartbeat",
  "evidence_submitted",
  "verification_rejected",
  "repair_started",
  "repair_submitted",
  "verification_passed",
  "task_closed",
  "worker_failed",
  "lease_expired",
  "task_dead_lettered",
] as const;

export const WORKER_EVENTS = ["worker_registered"] as const;

export const CALLBACK_EVENTS = [...WORKER_EVENTS, ...TASK_EVENTS] as const;
export type CallbackEventType = (typeof CALLBACK_EVENTS)[number];

export type TaskState =
  | "QUEUED"
  | "CLAIMED"
  | "IN_PROGRESS"
  | "AWAITING_VERIFICATION"
  | "NEEDS_REPAIR"
  | "REPAIRING"
  | "VERIFIED"
  | "CLOSED"
  | "DEAD_LETTERED";

export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set(["CLOSED", "DEAD_LETTERED"]);

export type CallbackRole = "matter" | "worker";

/** Events that may target a task the projection has never seen (it starts as QUEUED). */
export const MAY_CREATE_TASK: ReadonlySet<CallbackEventType> = new Set(["task_claimed"]);

/** Events where task_id is optional (worker-scoped when absent). */
export const TASK_OPTIONAL: ReadonlySet<CallbackEventType> = new Set(["heartbeat", "worker_failed"]);

type Transition = { from: readonly TaskState[]; to: (from: TaskState) => TaskState };

const LEASED: readonly TaskState[] = ["CLAIMED", "IN_PROGRESS", "REPAIRING", "NEEDS_REPAIR"];

export const TRANSITIONS: Record<(typeof TASK_EVENTS)[number], Transition> = {
  task_claimed: { from: ["QUEUED"], to: () => "CLAIMED" },
  heartbeat: {
    from: ["CLAIMED", "IN_PROGRESS", "REPAIRING"],
    to: (from) => (from === "CLAIMED" ? "IN_PROGRESS" : from),
  },
  evidence_submitted: { from: ["CLAIMED", "IN_PROGRESS"], to: () => "AWAITING_VERIFICATION" },
  verification_rejected: { from: ["AWAITING_VERIFICATION"], to: () => "NEEDS_REPAIR" },
  repair_started: { from: ["NEEDS_REPAIR"], to: () => "REPAIRING" },
  repair_submitted: { from: ["REPAIRING"], to: () => "AWAITING_VERIFICATION" },
  verification_passed: { from: ["AWAITING_VERIFICATION"], to: () => "VERIFIED" },
  task_closed: { from: ["VERIFIED"], to: () => "CLOSED" },
  worker_failed: { from: LEASED, to: () => "QUEUED" },
  lease_expired: { from: LEASED, to: () => "QUEUED" },
  task_dead_lettered: {
    from: ["QUEUED", "CLAIMED", "IN_PROGRESS", "AWAITING_VERIFICATION", "NEEDS_REPAIR", "REPAIRING", "VERIFIED"],
    to: () => "DEAD_LETTERED",
  },
};

/**
 * Which signing role may emit which event. Authority events (claims, verification,
 * closure, lease expiry, dead-letter, registration) come only from Matter. A worker
 * key may only report on its own work, and only while it holds the task.
 */
export const ROLE_EVENTS: Record<CallbackRole, ReadonlySet<CallbackEventType>> = {
  matter: new Set(CALLBACK_EVENTS),
  worker: new Set(["heartbeat", "evidence_submitted", "repair_started", "repair_submitted", "worker_failed"]),
};

/** Events whose worker_id must be the task's current lease holder. */
export const REQUIRES_LEASE_HOLDER: ReadonlySet<CallbackEventType> = new Set([
  "heartbeat",
  "evidence_submitted",
  "repair_started",
  "repair_submitted",
  "worker_failed",
]);

export type CallbackErrorCode =
  | "CALLBACK_DISABLED"
  | "METHOD_NOT_ALLOWED"
  | "PAYLOAD_TOO_LARGE"
  | "SIGNATURE_INVALID"
  | "TIMESTAMP_OUT_OF_WINDOW"
  | "REPLAY_DETECTED"
  | "RATE_LIMITED"
  | "MALFORMED_JSON"
  | "SCHEMA_INVALID"
  | "SECRET_IN_PAYLOAD"
  | "DOMAIN_FORBIDDEN"
  | "ROLE_FORBIDDEN"
  | "NOT_LEASE_HOLDER"
  | "VERIFIER_NOT_INDEPENDENT"
  | "IDEMPOTENCY_CONFLICT"
  | "UNKNOWN_TASK"
  | "UNKNOWN_WORKER"
  | "INVALID_TRANSITION"
  | "TASK_TERMINAL"
  | "STORE_UNAVAILABLE"
  | "INTERNAL_ERROR";

/**
 * HTTP status + retry classification. `retryable` tells the sender whether re-delivering
 * the SAME event (same idempotency key, fresh nonce/timestamp/signature) can succeed.
 */
export const ERROR_CODES: Record<CallbackErrorCode, { status: number; retryable: boolean }> = {
  CALLBACK_DISABLED: { status: 404, retryable: false },
  METHOD_NOT_ALLOWED: { status: 405, retryable: false },
  PAYLOAD_TOO_LARGE: { status: 413, retryable: false },
  SIGNATURE_INVALID: { status: 401, retryable: false },
  TIMESTAMP_OUT_OF_WINDOW: { status: 401, retryable: true },
  REPLAY_DETECTED: { status: 409, retryable: false },
  RATE_LIMITED: { status: 429, retryable: true },
  MALFORMED_JSON: { status: 400, retryable: false },
  SCHEMA_INVALID: { status: 422, retryable: false },
  SECRET_IN_PAYLOAD: { status: 422, retryable: false },
  DOMAIN_FORBIDDEN: { status: 403, retryable: false },
  ROLE_FORBIDDEN: { status: 403, retryable: false },
  NOT_LEASE_HOLDER: { status: 403, retryable: false },
  VERIFIER_NOT_INDEPENDENT: { status: 403, retryable: false },
  IDEMPOTENCY_CONFLICT: { status: 422, retryable: false },
  UNKNOWN_TASK: { status: 409, retryable: true },
  UNKNOWN_WORKER: { status: 409, retryable: true },
  INVALID_TRANSITION: { status: 409, retryable: false },
  TASK_TERMINAL: { status: 409, retryable: false },
  STORE_UNAVAILABLE: { status: 503, retryable: true },
  INTERNAL_ERROR: { status: 500, retryable: true },
};

export const DOMAIN_PATTERN = /^(party_perfect|mershon_personal|mershon:[a-z0-9_-]{1,32})$/;

export type CallbackEvent = {
  schema_version: typeof CALLBACK_SCHEMA_VERSION;
  event_id: string;
  idempotency_key: string;
  event_type: CallbackEventType;
  domain: string;
  occurred_at: string;
  worker_id: string;
  task_id?: string;
  message_id?: string;
  verifier_id?: string;
  lease?: { lease_id: string; expires_at: string };
  evidence?: { digest: string; ref: string };
  reason_code?: string;
  retryable?: boolean;
  capabilities?: string[];
};

export type TaskProjection = {
  task_id: string;
  domain: string;
  message_id: string | null;
  state: TaskState;
  assigned_worker: string | null;
  verifier_id: string | null;
  lease_id: string | null;
  lease_expires_at: string | null;
  attempts: number;
  retries: number;
  repair_attempts: number;
  evidence_digest: string | null;
  evidence_ref: string | null;
  rejection_reason: string | null;
  failure_reason: string | null;
  dead_letter_reason: string | null;
  last_event_id: string;
  last_event_type: CallbackEventType;
  last_event_at: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type WorkerProjection = {
  worker_id: string;
  domain: string;
  capabilities_declared: string[];
  registered_at: string;
  last_heartbeat_at: string | null;
  last_failure_code: string | null;
  updated_at: string;
};

export type AuditOutcome = "accepted" | "rejected";

export type AuditRecord = {
  audit_id: string;
  received_at: string;
  outcome: AuditOutcome;
  code: CallbackErrorCode | "ACCEPTED";
  key_id: string | null;
  principal: string | null;
  event_id: string | null;
  idempotency_key: string | null;
  event_type: CallbackEventType | null;
  domain: string | null;
  task_id: string | null;
  worker_id: string | null;
  from_state: TaskState | null;
  to_state: TaskState | null;
  body_sha256: string;
};

export type CallbackResponseBody = {
  ok: boolean;
  code: CallbackErrorCode | "ACCEPTED";
  retryable: boolean;
  duplicate?: boolean;
  event_id?: string;
  task_id?: string;
  state?: TaskState;
  audit_id?: string;
  errors?: string[];
};
