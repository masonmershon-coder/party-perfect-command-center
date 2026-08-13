/**
 * Talk-to-Mike remote intake orchestration (cloud/app side).
 * Does not invoke Matter/Mike. Does not create a second task on worker retry.
 */

import { randomUUID } from "node:crypto";
import {
  MIKE_INTAKE_LEASE_TTL_MS,
  MIKE_INTAKE_MAX_ATTEMPTS,
  MIKE_INTAKE_MAX_BYTES,
  contentFingerprint,
  isUploadExpired,
  logLooksSafe,
  normalizeContentType,
  objectPathForMessage,
  safeIntakeLog,
  shortIdFromMessage,
  validateCreateLimits,
  type MikeIntakeDevice,
  type MikeIntakeSenderId,
} from "./mike-intake-policy";
import {
  bearerToken,
  devicesFromEnv,
  requestHasTokenQuery,
  resolveDevice,
  resolveWorker,
} from "./mike-intake-auth";
import { enforceMikeIntakeCreateLimit } from "./mike-intake-rate-limit";
import type {
  MikeIntakeCommand,
  MikeIntakeStorage,
  MikeIntakeStore,
  SignedUploadInfo,
} from "./mike-intake-types";
import { recordIntakeTelemetry } from "./mike-intake-telemetry";

export type IntakeDeps = {
  store: MikeIntakeStore;
  storage: MikeIntakeStorage;
  devices?: MikeIntakeDevice[];
  env?: Record<string, string | undefined>;
  nowMs?: () => number;
  configured?: boolean;
};

export type IntakeHttpResult = {
  status: number;
  body: Record<string, unknown>;
};

function senderStatus(row: MikeIntakeCommand) {
  return {
    messageId: row.messageId,
    shortId: row.shortId,
    status: row.state,
    createdAt: row.createdAt,
    queuedAt: row.queuedAt,
    attemptCount: row.attemptCount,
  };
}

async function note(
  deps: IntakeDeps,
  event: {
    messageId: string;
    senderId: MikeIntakeSenderId | "worker";
    state: string;
    resultCode: number | string;
    latencyMs?: number;
    workerDeliveryState?: string;
    correlationId?: string;
  },
) {
  const payload = safeIntakeLog(event);
  if (!logLooksSafe(payload)) return;
  await deps.store.appendEvent({
    at: new Date().toISOString(),
    messageId: event.messageId,
    senderId: event.senderId,
    state: event.state,
    resultCode: event.resultCode,
    latencyMs: event.latencyMs,
    workerDeliveryState: event.workerDeliveryState,
    correlationId: event.correlationId,
  });
  void recordIntakeTelemetry(payload);
}

function authDevice(request: Request, deps: IntakeDeps) {
  if (requestHasTokenQuery(request)) {
    return { ok: false as const, status: 400 as const, error: "token_query_forbidden" };
  }
  return resolveDevice(bearerToken(request), deps.devices ?? devicesFromEnv(deps.env));
}

export async function createIntake(
  request: Request,
  deps: IntakeDeps,
): Promise<IntakeHttpResult> {
  const started = Date.now();
  if (deps.configured === false) {
    return { status: 503, body: { error: "intake unavailable" } };
  }
  const auth = authDevice(request, deps);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const contentType = normalizeContentType(String(body.contentType || body.mimeType || ""));
  const idempotencyKey = String(body.idempotencyKey || body.idempotency_key || "").trim();
  const bytes = body.bytes == null ? null : Number(body.bytes);
  const durationSeconds =
    body.durationSeconds == null && body.duration_seconds == null
      ? null
      : Number(body.durationSeconds ?? body.duration_seconds);
  const sha256 = typeof body.sha256 === "string" ? body.sha256.toLowerCase() : null;

  const limits = validateCreateLimits({
    contentType,
    bytes,
    durationSeconds,
    idempotencyKey,
  });
  if (!limits.ok) return { status: limits.status, body: { error: limits.error } };
  if (!contentType) return { status: 415, body: { error: "unsupported media type" } };

  const limited = await enforceMikeIntakeCreateLimit(auth.device.senderId);
  if (limited) return { status: 429, body: { error: "rate_limited" } };

  const fingerprint = contentFingerprint({
    contentType,
    bytes,
    durationSeconds,
    sha256,
  });
  const existing = await deps.store.findByIdempotency(auth.device.senderId, idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      await note(deps, {
        messageId: existing.messageId,
        senderId: auth.device.senderId,
        state: existing.state,
        resultCode: 409,
        latencyMs: Date.now() - started,
        correlationId: existing.correlationId,
      });
      return { status: 409, body: { error: "idempotency_conflict" } };
    }
    await note(deps, {
      messageId: existing.messageId,
      senderId: auth.device.senderId,
      state: existing.state,
      resultCode: 200,
      latencyMs: Date.now() - started,
      correlationId: existing.correlationId,
    });
    if (existing.state !== "RESERVED" || isUploadExpired(existing.createdAt, deps.nowMs?.() ?? Date.now())) {
      return { status: 200, body: senderStatus(existing) };
    }
    const upload = await deps.storage.createSignedUpload({
      path: existing.objectPath,
      contentType: existing.contentType,
    });
    return {
      status: 200,
      body: { ...senderStatus(existing), upload: publicUpload(upload) },
    };
  }

  const messageId = randomUUID();
  const correlationId = randomUUID();
  const createdAt = new Date(deps.nowMs?.() ?? Date.now()).toISOString();
  const objectPath = objectPathForMessage(messageId, contentType);
  const row: MikeIntakeCommand = {
    messageId,
    shortId: shortIdFromMessage(messageId),
    senderId: auth.device.senderId,
    idempotencyKey,
    fingerprint,
    state: "RESERVED",
    objectPath,
    contentType,
    bytes,
    durationSeconds,
    sha256,
    attemptCount: 0,
    leaseUntil: null,
    leaseOwner: null,
    deadLetterReason: null,
    retainUntil: null,
    correlationId,
    createdAt,
    updatedAt: createdAt,
    queuedAt: null,
    deliveredAt: null,
  };
  let saved: MikeIntakeCommand;
  try {
    saved = await deps.store.insertReserved(row);
  } catch {
    const raced = await deps.store.findByIdempotency(
      auth.device.senderId,
      idempotencyKey,
    );
    if (raced && raced.fingerprint === fingerprint) {
      return { status: 200, body: senderStatus(raced) };
    }
    throw new Error("intake_insert_failed");
  }
  const upload = await deps.storage.createSignedUpload({
    path: saved.objectPath,
    contentType: saved.contentType,
  });
  await note(deps, {
    messageId: saved.messageId,
    senderId: auth.device.senderId,
    state: "RESERVED",
    resultCode: 201,
    latencyMs: Date.now() - started,
    correlationId,
  });
  return {
    status: 201,
    body: { ...senderStatus(saved), upload: publicUpload(upload) },
  };
}

function publicUpload(upload: SignedUploadInfo) {
  return {
    url: upload.url,
    method: upload.method,
    headers: upload.headers,
    expiresAt: upload.expiresAt,
  };
}

export async function completeIntake(
  request: Request,
  deps: IntakeDeps,
): Promise<IntakeHttpResult> {
  const started = Date.now();
  if (deps.configured === false) {
    return { status: 503, body: { error: "intake unavailable" } };
  }
  const auth = authDevice(request, deps);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const messageId = String(body.messageId || body.message_id || "").trim();
  const idempotencyKey = String(body.idempotencyKey || body.idempotency_key || "").trim();
  const sha256 = typeof body.sha256 === "string" ? body.sha256.toLowerCase() : null;
  const durationSeconds =
    body.durationSeconds == null && body.duration_seconds == null
      ? null
      : Number(body.durationSeconds ?? body.duration_seconds);

  if (!messageId || !idempotencyKey) {
    return { status: 400, body: { error: "messageId and idempotencyKey required" } };
  }

  const row = await deps.store.getByMessageId(messageId);
  if (!row || row.senderId !== auth.device.senderId) {
    return { status: 404, body: { error: "not_found" } };
  }
  if (row.idempotencyKey !== idempotencyKey) {
    return { status: 409, body: { error: "idempotency_mismatch" } };
  }

  if (row.state === "QUEUED" || row.state === "LEASED" || row.state === "DELIVERED") {
    await note(deps, {
      messageId: row.messageId,
      senderId: auth.device.senderId,
      state: row.state,
      resultCode: 202,
      latencyMs: Date.now() - started,
      correlationId: row.correlationId,
    });
    return { status: 202, body: senderStatus(row) };
  }
  if (row.state === "DEAD_LETTER" || row.state === "EXPIRED") {
    return { status: 409, body: senderStatus(row) };
  }

  const now = deps.nowMs?.() ?? Date.now();
  if (isUploadExpired(row.createdAt, now)) {
    const expired = await deps.store.expireIfNeeded(row.messageId);
    await note(deps, {
      messageId: row.messageId,
      senderId: auth.device.senderId,
      state: "EXPIRED",
      resultCode: 410,
      latencyMs: Date.now() - started,
      correlationId: row.correlationId,
    });
    return { status: 410, body: senderStatus(expired || { ...row, state: "EXPIRED" }) };
  }

  const head = await deps.storage.headObject(row.objectPath);
  if (!head.exists) {
    await note(deps, {
      messageId: row.messageId,
      senderId: auth.device.senderId,
      state: row.state,
      resultCode: 409,
      latencyMs: Date.now() - started,
      correlationId: row.correlationId,
    });
    return { status: 409, body: { error: "missing_upload" } };
  }
  if (head.bytes != null && head.bytes > MIKE_INTAKE_MAX_BYTES) {
    return { status: 413, body: { error: "audio too large" } };
  }
  if (
    head.contentType &&
    normalizeContentType(head.contentType) &&
    normalizeContentType(head.contentType) !== row.contentType
  ) {
    return { status: 415, body: { error: "unsupported media type" } };
  }

  const queued = await deps.store.markQueued({
    messageId: row.messageId,
    senderId: auth.device.senderId,
    bytes: head.bytes ?? row.bytes,
    sha256: sha256 ?? row.sha256,
    durationSeconds: durationSeconds ?? row.durationSeconds,
  });
  await note(deps, {
    messageId: row.messageId,
    senderId: auth.device.senderId,
    state: "QUEUED",
    resultCode: 202,
    latencyMs: Date.now() - started,
    correlationId: row.correlationId,
  });
  return { status: 202, body: senderStatus(queued || { ...row, state: "QUEUED" }) };
}

export async function intakeStatus(
  request: Request,
  messageId: string,
  deps: IntakeDeps,
): Promise<IntakeHttpResult> {
  if (deps.configured === false) {
    return { status: 503, body: { error: "intake unavailable" } };
  }
  const auth = authDevice(request, deps);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const row = await deps.store.getByMessageId(messageId);
  if (!row || row.senderId !== auth.device.senderId) {
    return { status: 404, body: { error: "not_found" } };
  }
  return { status: 200, body: senderStatus(row) };
}

export async function workerLease(
  request: Request,
  deps: IntakeDeps,
): Promise<IntakeHttpResult> {
  if (requestHasTokenQuery(request)) {
    return { status: 400, body: { error: "token_query_forbidden" } };
  }
  const worker = resolveWorker(bearerToken(request), deps.env);
  if (!worker.ok) return { status: worker.status, body: { error: worker.error } };

  const leaseUntil = new Date(
    (deps.nowMs?.() ?? Date.now()) + MIKE_INTAKE_LEASE_TTL_MS,
  ).toISOString();
  const row = await deps.store.leaseNext("mac-outbound", leaseUntil);
  if (!row) return { status: 204, body: {} };
  if (row.state === "DEAD_LETTER") {
    await note(deps, {
      messageId: row.messageId,
      senderId: "worker",
      state: "DEAD_LETTER",
      resultCode: 200,
      workerDeliveryState: "dead_letter",
      correlationId: row.correlationId,
    });
    return {
      status: 200,
      body: {
        messageId: row.messageId,
        status: row.state,
        deadLetterReason: row.deadLetterReason,
      },
    };
  }
  await note(deps, {
    messageId: row.messageId,
    senderId: "worker",
    state: row.state,
    resultCode: 200,
    workerDeliveryState: "leased",
    correlationId: row.correlationId,
  });
  return {
    status: 200,
    body: {
      messageId: row.messageId,
      shortId: row.shortId,
      senderId: row.senderId,
      status: row.state,
      objectPath: row.objectPath,
      contentType: row.contentType,
      bytes: row.bytes,
      sha256: row.sha256,
      attemptCount: row.attemptCount,
      maxAttempts: MIKE_INTAKE_MAX_ATTEMPTS,
      leaseUntil: row.leaseUntil,
      correlationId: row.correlationId,
    },
  };
}

export async function workerAck(
  request: Request,
  deps: IntakeDeps,
): Promise<IntakeHttpResult> {
  if (requestHasTokenQuery(request)) {
    return { status: 400, body: { error: "token_query_forbidden" } };
  }
  const worker = resolveWorker(bearerToken(request), deps.env);
  if (!worker.ok) return { status: worker.status, body: { error: worker.error } };
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  const messageId = String(body.messageId || "").trim();
  if (!messageId) return { status: 400, body: { error: "messageId required" } };
  const row = await deps.store.ackDelivered(messageId, "mac-outbound");
  if (!row) return { status: 404, body: { error: "not_found" } };
  if (body.deleteAudio === true) {
    await deps.storage.deleteObject(row.objectPath);
  }
  await note(deps, {
    messageId: row.messageId,
    senderId: "worker",
    state: "DELIVERED",
    resultCode: 200,
    workerDeliveryState: "delivered",
    correlationId: row.correlationId,
  });
  return { status: 200, body: { messageId: row.messageId, status: row.state } };
}

export async function workerFail(
  request: Request,
  deps: IntakeDeps,
): Promise<IntakeHttpResult> {
  if (requestHasTokenQuery(request)) {
    return { status: 400, body: { error: "token_query_forbidden" } };
  }
  const worker = resolveWorker(bearerToken(request), deps.env);
  if (!worker.ok) return { status: worker.status, body: { error: worker.error } };
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  const messageId = String(body.messageId || "").trim();
  if (!messageId) return { status: 400, body: { error: "messageId required" } };
  const current = await deps.store.getByMessageId(messageId);
  if (!current) return { status: 404, body: { error: "not_found" } };
  const deadLetter =
    Boolean(body.deadLetter) || current.attemptCount >= MIKE_INTAKE_MAX_ATTEMPTS;
  const row = await deps.store.failAttempt({
    messageId,
    workerId: "mac-outbound",
    deadLetter,
    reason: String(body.reason || "worker_fail"),
  });
  await note(deps, {
    messageId,
    senderId: "worker",
    state: row?.state || "QUEUED",
    resultCode: 200,
    workerDeliveryState: deadLetter ? "dead_letter" : "retry",
    correlationId: current.correlationId,
  });
  return {
    status: 200,
    body: { messageId, status: row?.state || (deadLetter ? "DEAD_LETTER" : "QUEUED") },
  };
}

export async function workerHeartbeat(
  request: Request,
  deps: IntakeDeps,
): Promise<IntakeHttpResult> {
  if (requestHasTokenQuery(request)) {
    return { status: 400, body: { error: "token_query_forbidden" } };
  }
  const worker = resolveWorker(bearerToken(request), deps.env);
  if (!worker.ok) return { status: worker.status, body: { error: worker.error } };
  let detail: Record<string, unknown> = {};
  try {
    detail = (await request.json()) as Record<string, unknown>;
  } catch {
    detail = {};
  }
  await deps.store.heartbeat("mac-outbound", {
    queueDepth: detail.queueDepth ?? null,
  });
  const diag = await deps.store.diagnostics();
  return { status: 200, body: { ok: true, queue: diag } };
}
