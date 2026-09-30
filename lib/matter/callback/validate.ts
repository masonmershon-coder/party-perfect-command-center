import {
  CALLBACK_EVENTS,
  CALLBACK_SCHEMA_VERSION,
  DOMAIN_PATTERN,
  TASK_EVENTS,
  TASK_OPTIONAL,
  type CallbackEvent,
  type CallbackEventType,
} from "./contract";

const ALLOWED_KEYS = new Set([
  "schema_version",
  "event_id",
  "idempotency_key",
  "event_type",
  "domain",
  "occurred_at",
  "worker_id",
  "task_id",
  "message_id",
  "verifier_id",
  "lease",
  "evidence",
  "reason_code",
  "retryable",
  "capabilities",
]);

const RE = {
  eventId: /^[A-Za-z0-9_-]{8,64}$/,
  idemKey: /^[A-Za-z0-9:._-]{8,128}$/,
  taskId: /^[A-Z][A-Z0-9-]{2,63}$/,
  messageId: /^[A-Z][A-Z0-9-]{2,63}$/,
  workerId: /^[a-z0-9][a-z0-9._-]{1,63}$/,
  leaseId: /^[A-Za-z0-9._:-]{3,128}$/,
  digest: /^sha256:[a-f0-9]{64}$/,
  reasonCode: /^[A-Z][A-Z0-9_]{2,63}$/,
  capability: /^[a-z][a-z0-9_]{1,47}$/,
  evidenceRef: /^[A-Za-z0-9._:/#?=&-]{1,256}$/,
};

/** Credential shapes that must never travel through a callback. */
const SECRET_SHAPES = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /xai-[A-Za-z0-9]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /gh[opsu]_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const REQUIRES: Partial<Record<CallbackEventType, Array<keyof CallbackEvent>>> = {
  task_claimed: ["lease"],
  evidence_submitted: ["evidence"],
  repair_submitted: ["evidence"],
  verification_rejected: ["reason_code", "verifier_id"],
  verification_passed: ["verifier_id"],
  worker_failed: ["reason_code"],
  task_dead_lettered: ["reason_code"],
  worker_registered: ["capabilities"],
};

const isIso = (v: unknown) => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v);

export type ValidationResult =
  | { ok: true; event: CallbackEvent }
  | { ok: false; code: "SCHEMA_INVALID" | "SECRET_IN_PAYLOAD"; errors: string[] };

/** Strict validation. Error messages name fields only and never echo submitted values. */
export function validateEvent(input: unknown, rawBody: string): ValidationResult {
  if (SECRET_SHAPES.some((re) => re.test(rawBody))) {
    return { ok: false, code: "SECRET_IN_PAYLOAD", errors: ["payload contains a credential-shaped value"] };
  }
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, code: "SCHEMA_INVALID", errors: ["body must be a JSON object"] };
  }
  const o = input as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!ALLOWED_KEYS.has(k)) errors.push(`unknown field: ${k.slice(0, 40)}`);

  const str = (k: string, re: RegExp, required: boolean) => {
    const v = o[k];
    if (v === undefined) {
      if (required) errors.push(`${k}: required`);
      return;
    }
    if (typeof v !== "string" || !re.test(v)) errors.push(`${k}: invalid format`);
  };

  if (o.schema_version !== CALLBACK_SCHEMA_VERSION) errors.push(`schema_version: must be ${CALLBACK_SCHEMA_VERSION}`);
  str("event_id", RE.eventId, true);
  str("idempotency_key", RE.idemKey, true);
  if (typeof o.event_type !== "string" || !(CALLBACK_EVENTS as readonly string[]).includes(o.event_type)) {
    errors.push("event_type: unknown");
  }
  if (typeof o.domain !== "string" || !DOMAIN_PATTERN.test(o.domain)) errors.push("domain: invalid");
  if (!isIso(o.occurred_at)) errors.push("occurred_at: must be ISO-8601");
  str("worker_id", RE.workerId, true);
  str("message_id", RE.messageId, false);
  str("verifier_id", RE.workerId, false);
  str("reason_code", RE.reasonCode, false);

  const type = o.event_type as CallbackEventType;
  const isTaskEvent = (TASK_EVENTS as readonly string[]).includes(type);
  str("task_id", RE.taskId, isTaskEvent && !TASK_OPTIONAL.has(type));
  if (!isTaskEvent && o.task_id !== undefined) errors.push("task_id: not allowed for worker_registered");

  if (o.lease !== undefined) {
    const l = o.lease as Record<string, unknown> | null;
    if (!l || typeof l !== "object" || Array.isArray(l)) errors.push("lease: must be an object");
    else {
      if (Object.keys(l).some((k) => k !== "lease_id" && k !== "expires_at")) errors.push("lease: unknown field");
      if (typeof l.lease_id !== "string" || !RE.leaseId.test(l.lease_id)) errors.push("lease.lease_id: invalid format");
      if (!isIso(l.expires_at)) errors.push("lease.expires_at: must be ISO-8601");
    }
  }
  if (o.evidence !== undefined) {
    const e = o.evidence as Record<string, unknown> | null;
    if (!e || typeof e !== "object" || Array.isArray(e)) errors.push("evidence: must be an object");
    else {
      if (Object.keys(e).some((k) => k !== "digest" && k !== "ref")) errors.push("evidence: unknown field");
      if (typeof e.digest !== "string" || !RE.digest.test(e.digest)) errors.push("evidence.digest: must be sha256:<64 hex>");
      if (typeof e.ref !== "string" || !RE.evidenceRef.test(e.ref) || e.ref.startsWith("/") || e.ref.includes(".."))
        errors.push("evidence.ref: must be a relative reference, not a filesystem path");
    }
  }
  if (o.retryable !== undefined && typeof o.retryable !== "boolean") errors.push("retryable: must be boolean");
  if (o.capabilities !== undefined) {
    const c = o.capabilities;
    if (!Array.isArray(c) || c.length > 32 || !c.every((x) => typeof x === "string" && RE.capability.test(x)))
      errors.push("capabilities: must be up to 32 lowercase capability names");
  }
  for (const k of REQUIRES[type] ?? []) if (o[k] === undefined) errors.push(`${k}: required for ${type}`);

  if (errors.length) return { ok: false, code: "SCHEMA_INVALID", errors: errors.slice(0, 20) };
  return { ok: true, event: o as unknown as CallbackEvent };
}
