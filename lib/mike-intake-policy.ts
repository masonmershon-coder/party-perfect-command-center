/**
 * Talk-to-Mike remote intake — pure policy.
 * No DB, no secrets, no network. Same logic production + tests.
 */

import { createHash } from "node:crypto";

export const MIKE_INTAKE_MAX_BYTES = 20 * 1024 * 1024;
export const MIKE_INTAKE_MAX_DURATION_SECONDS = 600;
export const MIKE_INTAKE_UPLOAD_TTL_MS = 15 * 60 * 1000;
export const MIKE_INTAKE_LEASE_TTL_MS = 5 * 60 * 1000;
export const MIKE_INTAKE_MAX_ATTEMPTS = 5;
export const MIKE_INTAKE_CREATE_PER_HOUR = 20;
export const MIKE_INTAKE_BUCKET = "mike-intake-audio";

export const MIKE_INTAKE_ACCEPTED_TYPES = [
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
] as const;

export type MikeIntakeState =
  | "RESERVED"
  | "QUEUED"
  | "LEASED"
  | "DELIVERED"
  | "DEAD_LETTER"
  | "EXPIRED";

export type MikeIntakeSenderId = "mason" | "josh";

export type MikeIntakeDevice = {
  senderId: MikeIntakeSenderId;
  tokenSha256: string;
  revoked: boolean;
  responseThread: string;
};

export function normalizeContentType(raw: string | undefined | null): string | null {
  const ct = String(raw || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ct) return null;
  if ((MIKE_INTAKE_ACCEPTED_TYPES as readonly string[]).includes(ct)) return ct;
  if (ct === "audio/x-wav") return "audio/wav";
  return null;
}

export function extensionForContentType(ct: string): string {
  switch (ct) {
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
    case "audio/webm":
      return "webm";
    case "audio/aac":
      return "aac";
    default:
      return "m4a";
  }
}

export function objectPathForMessage(messageId: string, contentType: string): string {
  const ext = extensionForContentType(contentType);
  const y = new Date().toISOString().slice(0, 7).replace("-", "/");
  return `audio/${y}/${messageId}.${ext}`;
}

export function shortIdFromMessage(messageId: string): string {
  return messageId.replace(/-/g, "").slice(0, 8);
}

export function contentFingerprint(input: {
  contentType: string;
  bytes?: number | null;
  durationSeconds?: number | null;
  sha256?: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ct: input.contentType,
        b: input.bytes ?? null,
        d: input.durationSeconds ?? null,
        h: (input.sha256 || "").toLowerCase(),
      }),
    )
    .digest("hex");
}

export function validateCreateLimits(input: {
  contentType: string | null;
  bytes?: number | null;
  durationSeconds?: number | null;
  idempotencyKey?: string | null;
}): { ok: true } | { ok: false; error: string; status: number } {
  if (!input.idempotencyKey || !/^[0-9a-f-]{8,64}$/i.test(input.idempotencyKey.trim())) {
    return { ok: false, error: "idempotencyKey required (UUID)", status: 400 };
  }
  if (!input.contentType) {
    return { ok: false, error: "unsupported media type", status: 415 };
  }
  if (input.bytes != null && (!Number.isFinite(input.bytes) || input.bytes <= 0)) {
    return { ok: false, error: "invalid bytes", status: 400 };
  }
  if (input.bytes != null && input.bytes > MIKE_INTAKE_MAX_BYTES) {
    return { ok: false, error: "audio too large", status: 413 };
  }
  if (
    input.durationSeconds != null &&
    (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0)
  ) {
    return { ok: false, error: "invalid duration", status: 400 };
  }
  if (
    input.durationSeconds != null &&
    input.durationSeconds > MIKE_INTAKE_MAX_DURATION_SECONDS
  ) {
    return { ok: false, error: "audio too long", status: 413 };
  }
  return { ok: true };
}

export function isUploadExpired(createdAtIso: string, nowMs = Date.now()): boolean {
  const t = Date.parse(createdAtIso);
  if (!Number.isFinite(t)) return true;
  return nowMs - t > MIKE_INTAKE_UPLOAD_TTL_MS;
}

export function nextLeaseState(input: {
  state: MikeIntakeState;
  attemptCount: number;
  leaseUntil?: string | null;
  nowMs?: number;
}):
  | { ok: true; nextAttempts: number }
  | { ok: false; deadLetter: boolean; reason: string } {
  const now = input.nowMs ?? Date.now();
  if (input.state === "DEAD_LETTER" || input.state === "DELIVERED" || input.state === "EXPIRED") {
    return { ok: false, deadLetter: input.state === "DEAD_LETTER", reason: "not_leasable" };
  }
  if (input.state === "LEASED") {
    const until = input.leaseUntil ? Date.parse(input.leaseUntil) : 0;
    if (Number.isFinite(until) && until > now) {
      return { ok: false, deadLetter: false, reason: "lease_active" };
    }
  }
  if (input.state !== "QUEUED" && input.state !== "LEASED") {
    return { ok: false, deadLetter: false, reason: "not_queued" };
  }
  const nextAttempts = input.attemptCount + 1;
  if (nextAttempts > MIKE_INTAKE_MAX_ATTEMPTS) {
    return { ok: false, deadLetter: true, reason: "max_attempts" };
  }
  return { ok: true, nextAttempts };
}

export function safeIntakeLog(input: {
  messageId?: string;
  senderId?: string;
  state?: string;
  resultCode?: number | string;
  latencyMs?: number;
  workerDeliveryState?: string;
  correlationId?: string;
}): Record<string, unknown> {
  return {
    message_id: input.messageId || null,
    sender_id: input.senderId || null,
    state: input.state || null,
    result_code: input.resultCode ?? null,
    latency_ms: input.latencyMs ?? null,
    worker_delivery_state: input.workerDeliveryState || null,
    correlation_id: input.correlationId || null,
  };
}

export function logLooksSafe(payload: unknown): boolean {
  const s = JSON.stringify(payload).toLowerCase();
  if (/bearer\s+[a-z0-9._-]{8,}/.test(s)) return false;
  if (/signedurl|signed_url|service_role|supabase_service/.test(s)) return false;
  if (/transcript|approval.?code|owner_pin|password=/.test(s)) return false;
  if (/\+1\d{10}\b/.test(s)) return false;
  return true;
}
