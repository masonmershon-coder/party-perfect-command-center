import type { MikeIntakeSenderId, MikeIntakeState } from "./mike-intake-policy";

export type MikeIntakeCommand = {
  messageId: string;
  shortId: string;
  senderId: MikeIntakeSenderId;
  idempotencyKey: string;
  fingerprint: string;
  state: MikeIntakeState;
  objectPath: string;
  contentType: string;
  bytes: number | null;
  durationSeconds: number | null;
  sha256: string | null;
  attemptCount: number;
  leaseUntil: string | null;
  leaseOwner: string | null;
  /** Fencing token, regenerated on every lease. See the note in migration 0007. */
  leaseId: string | null;
  deadLetterReason: string | null;
  retainUntil: string | null;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  queuedAt: string | null;
  deliveredAt: string | null;
};

export type MikeIntakeEvent = {
  at: string;
  messageId: string;
  senderId: MikeIntakeSenderId | "worker";
  state: string;
  resultCode: number | string;
  latencyMs?: number;
  workerDeliveryState?: string;
  correlationId?: string;
};

export type SignedUploadInfo = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
  bucket: string;
  path: string;
};

export type MikeIntakeStorage = {
  createSignedUpload(input: {
    path: string;
    contentType: string;
    upsert?: boolean;
  }): Promise<SignedUploadInfo>;
  headObject(path: string): Promise<{ exists: boolean; bytes?: number; contentType?: string }>;
  deleteObject(path: string): Promise<void>;
};

export type MikeIntakeStore = {
  findByIdempotency(
    senderId: MikeIntakeSenderId,
    idempotencyKey: string,
  ): Promise<MikeIntakeCommand | null>;
  getByMessageId(messageId: string): Promise<MikeIntakeCommand | null>;
  insertReserved(row: MikeIntakeCommand): Promise<MikeIntakeCommand>;
  markQueued(input: {
    messageId: string;
    senderId: MikeIntakeSenderId;
    bytes: number | null;
    sha256: string | null;
    durationSeconds: number | null;
  }): Promise<MikeIntakeCommand | null>;
  expireIfNeeded(messageId: string): Promise<MikeIntakeCommand | null>;
  leaseNext(workerId: string, leaseUntilIso: string): Promise<MikeIntakeCommand | null>;
  // ACK/FAIL take the leaseId they were issued under. A callback that cannot present
  // the current lease token is refused, so a late or duplicate FAIL can never move an
  // already-DELIVERED command back into the queue.
  ackDelivered(
    messageId: string,
    workerId: string,
    leaseId: string,
  ): Promise<MikeIntakeCommand | null>;
  failAttempt(input: {
    messageId: string;
    workerId: string;
    leaseId: string;
    deadLetter: boolean;
    reason: string;
  }): Promise<MikeIntakeCommand | null>;
  appendEvent(event: MikeIntakeEvent): Promise<void>;
  heartbeat(workerId: string, detail?: Record<string, unknown>): Promise<void>;
  diagnostics(): Promise<{
    reserved: number;
    queued: number;
    leased: number;
    delivered: number;
    deadLetter: number;
    expired: number;
    lastHeartbeatAt: string | null;
  }>;
};
