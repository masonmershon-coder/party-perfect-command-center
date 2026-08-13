import { randomUUID } from "node:crypto";
import { isAiCoreConfigured } from "./ai-core";
import type {
  MikeIntakeCommand,
  MikeIntakeEvent,
  MikeIntakeStore,
} from "./mike-intake-types";
import type { MikeIntakeSenderId } from "./mike-intake-policy";
import pg from "pg";

const g = globalThis as unknown as { __aiCorePool?: pg.Pool };

function db(): pg.Pool {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("ai_core: DATABASE_URL not set");
  if (!g.__aiCorePool) {
    g.__aiCorePool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      ssl: { rejectUnauthorized: false },
    });
  }
  return g.__aiCorePool;
}

function mapRow(r: Record<string, unknown>): MikeIntakeCommand {
  return {
    messageId: String(r.message_id),
    shortId: String(r.short_id),
    senderId: r.sender_id as MikeIntakeSenderId,
    idempotencyKey: String(r.idempotency_key),
    fingerprint: String(r.fingerprint),
    state: r.state as MikeIntakeCommand["state"],
    objectPath: String(r.object_path),
    contentType: String(r.content_type),
    bytes: r.bytes == null ? null : Number(r.bytes),
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    sha256: r.sha256 == null ? null : String(r.sha256),
    attemptCount: Number(r.attempt_count || 0),
    leaseUntil: r.lease_until ? new Date(String(r.lease_until)).toISOString() : null,
    leaseOwner: r.lease_owner == null ? null : String(r.lease_owner),
    leaseId: r.lease_id == null ? null : String(r.lease_id),
    deadLetterReason: r.dead_letter_reason == null ? null : String(r.dead_letter_reason),
    retainUntil: r.retain_until ? new Date(String(r.retain_until)).toISOString() : null,
    correlationId: String(r.correlation_id),
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
    queuedAt: r.queued_at ? new Date(String(r.queued_at)).toISOString() : null,
    deliveredAt: r.delivered_at ? new Date(String(r.delivered_at)).toISOString() : null,
  };
}

export function isMikeIntakeDbConfigured(): boolean {
  return isAiCoreConfigured();
}

export class PostgresMikeIntakeStore implements MikeIntakeStore {
  async findByIdempotency(senderId: MikeIntakeSenderId, idempotencyKey: string) {
    const { rows } = await db().query(
      `select * from ai_core.intake_commands where sender_id=$1 and idempotency_key=$2`,
      [senderId, idempotencyKey],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async getByMessageId(messageId: string) {
    const { rows } = await db().query(
      `select * from ai_core.intake_commands where message_id=$1`,
      [messageId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async insertReserved(row: MikeIntakeCommand) {
    const { rows } = await db().query(
      `insert into ai_core.intake_commands (
         message_id, short_id, sender_id, idempotency_key, fingerprint, state,
         object_path, content_type, bytes, duration_seconds, sha256, attempt_count,
         correlation_id, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,'RESERVED',$6,$7,$8,$9,$10,0,$11,$12,$12)
       returning *`,
      [
        row.messageId,
        row.shortId,
        row.senderId,
        row.idempotencyKey,
        row.fingerprint,
        row.objectPath,
        row.contentType,
        row.bytes,
        row.durationSeconds,
        row.sha256,
        row.correlationId,
        row.createdAt,
      ],
    );
    return mapRow(rows[0]);
  }

  async markQueued(input: {
    messageId: string;
    senderId: MikeIntakeSenderId;
    bytes: number | null;
    sha256: string | null;
    durationSeconds: number | null;
  }) {
    const { rows } = await db().query(
      `update ai_core.intake_commands
          set state = case when state = 'RESERVED' then 'QUEUED' else state end,
              bytes = coalesce($3, bytes),
              sha256 = coalesce($4, sha256),
              duration_seconds = coalesce($5, duration_seconds),
              queued_at = coalesce(queued_at, now()),
              updated_at = now()
        where message_id=$1 and sender_id=$2
        returning *`,
      [input.messageId, input.senderId, input.bytes, input.sha256, input.durationSeconds],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async expireIfNeeded(messageId: string) {
    const { rows } = await db().query(
      `update ai_core.intake_commands
          set state='EXPIRED', updated_at=now()
        where message_id=$1 and state='RESERVED'
        returning *`,
      [messageId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async leaseNext(workerId: string, leaseUntilIso: string) {
    const client = await db().connect();
    try {
      await client.query("begin");
      const { rows } = await client.query(
        `select * from ai_core.intake_commands
          where state in ('QUEUED','LEASED')
            and (state='QUEUED' or lease_until is null or lease_until <= now())
          order by created_at asc
          for update skip locked
          limit 1`,
      );
      if (!rows[0]) {
        await client.query("commit");
        return null;
      }
      const current = mapRow(rows[0]);
      if (current.attemptCount + 1 > 5) {
        const dead = await client.query(
          `update ai_core.intake_commands
              set state='DEAD_LETTER', dead_letter_reason='max_attempts', updated_at=now(),
                  lease_until=null, lease_owner=null
            where message_id=$1 returning *`,
          [current.messageId],
        );
        await client.query("commit");
        return dead.rows[0] ? mapRow(dead.rows[0]) : null;
      }
      // A fresh fencing token per lease. Everything issued under a previous attempt is
      // invalidated the moment this row is re-leased.
      const leaseId = randomUUID();
      const leased = await client.query(
        `update ai_core.intake_commands
            set state='LEASED', attempt_count=attempt_count+1,
                lease_owner=$2, lease_until=$3::timestamptz, lease_id=$4, updated_at=now()
          where message_id=$1 returning *`,
        [current.messageId, workerId, leaseUntilIso, leaseId],
      );
      await client.query("commit");
      return leased.rows[0] ? mapRow(leased.rows[0]) : null;
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async ackDelivered(messageId: string, workerId: string, leaseId: string) {
    // Guarded on state='LEASED' AND the exact lease token, and it CLEARS lease_owner
    // and lease_id. Previously lease_owner survived the ACK, so a later FAIL still
    // matched and pushed a delivered message back to QUEUED — a duplicate delivery.
    const { rows } = await db().query(
      `update ai_core.intake_commands
          set state='DELIVERED', delivered_at=now(), updated_at=now(),
              lease_until=null, lease_owner=null, lease_id=null
        where message_id=$1 and lease_owner=$2 and lease_id=$3 and state='LEASED'
        returning *`,
      [messageId, workerId, leaseId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async failAttempt(input: {
    messageId: string;
    workerId: string;
    leaseId: string;
    deadLetter: boolean;
    reason: string;
  }) {
    const { rows } = await db().query(
      `update ai_core.intake_commands
          set state=$4, dead_letter_reason=$5, lease_until=null, lease_owner=null,
              lease_id=null, updated_at=now()
        where message_id=$1 and lease_owner=$2 and lease_id=$3 and state='LEASED'
        returning *`,
      [
        input.messageId,
        input.workerId,
        input.leaseId,
        input.deadLetter ? "DEAD_LETTER" : "QUEUED",
        input.deadLetter ? input.reason : null,
      ],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async appendEvent(event: MikeIntakeEvent) {
    await db().query(
      `insert into ai_core.intake_events
         (at, message_id, sender_id, state, result_code, latency_ms, worker_delivery_state, correlation_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.at,
        event.messageId,
        event.senderId,
        event.state,
        String(event.resultCode),
        event.latencyMs ?? null,
        event.workerDeliveryState ?? null,
        event.correlationId ?? null,
      ],
    );
  }

  async heartbeat(workerId: string, detail?: Record<string, unknown>) {
    await db().query(
      `insert into ai_core.intake_worker_heartbeats (worker_id, at, detail)
       values ($1, now(), $2::jsonb)`,
      [workerId, JSON.stringify(detail ?? {})],
    );
  }

  async diagnostics() {
    const { rows } = await db().query(
      `select state, count(*)::int as n from ai_core.intake_commands group by state`,
    );
    const counts = {
      reserved: 0,
      queued: 0,
      leased: 0,
      delivered: 0,
      deadLetter: 0,
      expired: 0,
    };
    for (const r of rows) {
      const n = Number(r.n);
      if (r.state === "RESERVED") counts.reserved = n;
      if (r.state === "QUEUED") counts.queued = n;
      if (r.state === "LEASED") counts.leased = n;
      if (r.state === "DELIVERED") counts.delivered = n;
      if (r.state === "DEAD_LETTER") counts.deadLetter = n;
      if (r.state === "EXPIRED") counts.expired = n;
    }
    const hb = await db().query(
      `select at from ai_core.intake_worker_heartbeats order by at desc limit 1`,
    );
    return {
      ...counts,
      lastHeartbeatAt: hb.rows[0]?.at
        ? new Date(String(hb.rows[0].at)).toISOString()
        : null,
    };
  }
}
