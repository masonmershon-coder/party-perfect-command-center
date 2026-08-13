import type {
  MikeIntakeCommand,
  MikeIntakeEvent,
  MikeIntakeStore,
  MikeIntakeStorage,
  SignedUploadInfo,
} from "./mike-intake-types";
import type { MikeIntakeSenderId } from "./mike-intake-policy";
import { MIKE_INTAKE_BUCKET } from "./mike-intake-policy";

export class MemoryMikeIntakeStore implements MikeIntakeStore {
  commands = new Map<string, MikeIntakeCommand>();
  byIdem = new Map<string, string>();
  events: MikeIntakeEvent[] = [];
  heartbeats: Array<{ at: string; workerId: string; detail?: Record<string, unknown> }> = [];

  async findByIdempotency(senderId: MikeIntakeSenderId, idempotencyKey: string) {
    const id = this.byIdem.get(`${senderId}:${idempotencyKey}`);
    return id ? this.commands.get(id) ?? null : null;
  }

  async getByMessageId(messageId: string) {
    return this.commands.get(messageId) ?? null;
  }

  async insertReserved(row: MikeIntakeCommand) {
    this.commands.set(row.messageId, { ...row });
    this.byIdem.set(`${row.senderId}:${row.idempotencyKey}`, row.messageId);
    return { ...row };
  }

  async markQueued(input: {
    messageId: string;
    senderId: MikeIntakeSenderId;
    bytes: number | null;
    sha256: string | null;
    durationSeconds: number | null;
  }) {
    const row = this.commands.get(input.messageId);
    if (!row || row.senderId !== input.senderId) return null;
    const next: MikeIntakeCommand = {
      ...row,
      state: row.state === "RESERVED" ? "QUEUED" : row.state,
      bytes: input.bytes ?? row.bytes,
      sha256: input.sha256 ?? row.sha256,
      durationSeconds: input.durationSeconds ?? row.durationSeconds,
      queuedAt: row.queuedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.commands.set(input.messageId, next);
    return { ...next };
  }

  async expireIfNeeded(messageId: string) {
    const row = this.commands.get(messageId);
    if (!row) return null;
    const next = { ...row, state: "EXPIRED" as const, updatedAt: new Date().toISOString() };
    this.commands.set(messageId, next);
    return { ...next };
  }

  async leaseNext(workerId: string, leaseUntilIso: string) {
    const now = Date.now();
    const candidates = [...this.commands.values()]
      .filter((c) => {
        if (c.state === "QUEUED") return true;
        if (c.state === "LEASED") {
          const until = c.leaseUntil ? Date.parse(c.leaseUntil) : 0;
          return !Number.isFinite(until) || until <= now;
        }
        return false;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const row = candidates[0];
    if (!row) return null;
    if (row.attemptCount + 1 > 5) {
      const dead = {
        ...row,
        state: "DEAD_LETTER" as const,
        deadLetterReason: "max_attempts",
        updatedAt: new Date().toISOString(),
      };
      this.commands.set(row.messageId, dead);
      return { ...dead };
    }
    const next: MikeIntakeCommand = {
      ...row,
      state: "LEASED",
      attemptCount: row.attemptCount + 1,
      leaseOwner: workerId,
      leaseUntil: leaseUntilIso,
      updatedAt: new Date().toISOString(),
    };
    this.commands.set(row.messageId, next);
    return { ...next };
  }

  async ackDelivered(messageId: string, workerId: string) {
    const row = this.commands.get(messageId);
    if (!row || row.leaseOwner !== workerId) return null;
    const next: MikeIntakeCommand = {
      ...row,
      state: "DELIVERED",
      deliveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      leaseUntil: null,
    };
    this.commands.set(messageId, next);
    return { ...next };
  }

  async failAttempt(input: {
    messageId: string;
    workerId: string;
    deadLetter: boolean;
    reason: string;
  }) {
    const row = this.commands.get(input.messageId);
    if (!row || row.leaseOwner !== input.workerId) return null;
    const next: MikeIntakeCommand = {
      ...row,
      state: input.deadLetter ? "DEAD_LETTER" : "QUEUED",
      deadLetterReason: input.deadLetter ? input.reason : null,
      leaseUntil: null,
      leaseOwner: null,
      updatedAt: new Date().toISOString(),
    };
    this.commands.set(input.messageId, next);
    return { ...next };
  }

  async appendEvent(event: MikeIntakeEvent) {
    this.events.push(event);
  }

  async heartbeat(workerId: string, detail?: Record<string, unknown>) {
    this.heartbeats.push({ at: new Date().toISOString(), workerId, detail });
  }

  async diagnostics() {
    const counts = {
      reserved: 0,
      queued: 0,
      leased: 0,
      delivered: 0,
      deadLetter: 0,
      expired: 0,
    };
    for (const c of this.commands.values()) {
      if (c.state === "RESERVED") counts.reserved += 1;
      if (c.state === "QUEUED") counts.queued += 1;
      if (c.state === "LEASED") counts.leased += 1;
      if (c.state === "DELIVERED") counts.delivered += 1;
      if (c.state === "DEAD_LETTER") counts.deadLetter += 1;
      if (c.state === "EXPIRED") counts.expired += 1;
    }
    return {
      ...counts,
      lastHeartbeatAt: this.heartbeats.at(-1)?.at ?? null,
    };
  }
}

export class MemoryMikeIntakeStorage implements MikeIntakeStorage {
  objects = new Map<string, { bytes: number; contentType: string }>();

  async createSignedUpload(input: {
    path: string;
    contentType: string;
  }): Promise<SignedUploadInfo> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return {
      url: `https://storage.test/upload/${encodeURIComponent(input.path)}`,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      expiresAt,
      bucket: MIKE_INTAKE_BUCKET,
      path: input.path,
    };
  }

  async headObject(path: string) {
    const obj = this.objects.get(path);
    if (!obj) return { exists: false };
    return { exists: true, bytes: obj.bytes, contentType: obj.contentType };
  }

  async deleteObject(path: string) {
    this.objects.delete(path);
  }

  put(path: string, bytes: number, contentType: string) {
    this.objects.set(path, { bytes, contentType });
  }
}
