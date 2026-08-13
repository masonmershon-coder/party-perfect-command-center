/**
 * Postgres AI cost store. Requires 0008 applied. Not used until DATABASE_URL + migration.
 */
import pg from "pg";
import { isAiCoreConfigured } from "./ai-core";
import { immutableUsageFingerprint } from "./ai-cost-math";
import type { AiCostStore } from "./ai-cost-store";
import type {
  AuditEntry,
  BudgetRecord,
  CostAlert,
  ImportRun,
  SubscriptionRecord,
  UsageEvent,
} from "./ai-cost-types";

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

export function isAiCostDbConfigured(): boolean {
  return isAiCoreConfigured();
}

function mapUsage(r: Record<string, unknown>): UsageEvent {
  return {
    eventId: String(r.id),
    occurredAt: new Date(String(r.occurred_at || r.at)).toISOString(),
    ingestedAt: new Date(String(r.ingested_at || r.at)).toISOString(),
    agentId: String(r.agent_id || r.persona || "unknown"),
    taskId: r.task_id == null ? null : String(r.task_id),
    correlationId: r.correlation_id == null ? null : String(r.correlation_id),
    provider: String(r.provider),
    model: r.model == null ? null : String(r.model),
    operation: String(r.operation || "unknown"),
    inputTokens: r.input_tokens == null ? null : Number(r.input_tokens),
    outputTokens: r.output_tokens == null ? null : Number(r.output_tokens),
    cachedTokens: r.cached_tokens == null ? null : Number(r.cached_tokens),
    cachedOutputTokens: r.cached_output_tokens == null ? null : Number(r.cached_output_tokens),
    reasoningTokens: r.reasoning_tokens == null ? null : Number(r.reasoning_tokens),
    requestCount: Number(r.request_count || 1),
    audioSeconds: r.audio_seconds == null ? null : Number(r.audio_seconds),
    transcriptionSeconds: r.transcription_seconds == null ? null : Number(r.transcription_seconds),
    imageCount: r.image_count == null ? null : Number(r.image_count),
    storageBytes: r.storage_bytes == null ? null : Number(r.storage_bytes),
    computeMs: r.compute_ms == null ? null : Number(r.compute_ms),
    extraUnits: r.extra_units && typeof r.extra_units === "object" ? (r.extra_units as Record<string, number>) : null,
    causationId: r.causation_id == null ? null : String(r.causation_id),
    usageKind:
      r.usage_kind === "included" || r.usage_kind === "overage" || r.usage_kind === "metered"
        ? r.usage_kind
        : null,
    fingerprint: r.fingerprint == null ? "" : String(r.fingerprint),
    retries: Number(r.retries || 0),
    success: r.success == null ? null : Boolean(r.success),
    estimatedCostUsd: r.est_cost_usd == null ? null : Number(r.est_cost_usd),
    verifiedCostUsd: r.actual_cost_usd == null ? null : Number(r.actual_cost_usd),
    rateVersion: r.rate_version == null ? null : String(r.rate_version),
    domain: String(r.domain) === "mershon_personal" ? "mershon_personal" : "party_perfect",
    source: (String(r.source || "app_event") as UsageEvent["source"]),
    idempotencyKey: String(r.idempotency_key || r.id),
    providerEventRef: r.provider_event_ref == null ? null : String(r.provider_event_ref),
    verificationStatus: (String(r.verification_status || "UNVERIFIED") as UsageEvent["verificationStatus"]),
    humanTriggered: Boolean(r.human_triggered),
    status: String(r.status || (r.success === false ? "failed" : "completed")),
  };
}

export class PostgresAiCostStore implements AiCostStore {
  async insertUsage(event: UsageEvent) {
    try {
      await db().query(
        `insert into ai_core.ai_usage (
           id, at, occurred_at, ingested_at, domain, persona, agent_id, provider, model, operation,
           input_tokens, output_tokens, cached_tokens, audio_seconds, est_cost_usd, actual_cost_usd,
           retries, success, task_id, idempotency_key, rate_version, source, verification_status,
           correlation_id, human_triggered, provider_event_ref, status
         ) values (
           $1, $2, $2, $3, $4, $5, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $18, $19, $20, $21,
           $22, $23, $24, $25
         )`,
        [
          event.eventId,
          event.occurredAt,
          event.ingestedAt,
          event.domain,
          event.agentId,
          event.provider,
          event.model,
          event.operation,
          event.inputTokens,
          event.outputTokens,
          event.cachedTokens,
          event.audioSeconds,
          event.estimatedCostUsd,
          event.verifiedCostUsd,
          event.retries,
          event.success ?? true,
          event.taskId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.taskId)
            ? event.taskId
            : null,
          event.idempotencyKey,
          event.rateVersion,
          event.source,
          event.verificationStatus,
          event.correlationId,
          event.humanTriggered,
          event.providerEventRef,
          event.status,
        ],
      );
      return "accepted";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate|unique/i.test(msg)) {
        const { rows } = await db().query(
          `select * from ai_core.ai_usage where idempotency_key=$1 limit 1`,
          [event.idempotencyKey],
        );
        if (!rows[0]) return "duplicate";
        const existing = mapUsage(rows[0] as Record<string, unknown>);
        const prev = existing.fingerprint || immutableUsageFingerprint(existing);
        const next = event.fingerprint || immutableUsageFingerprint(event);
        if (prev !== next) {
          await this.appendAudit({
            actor: "collector",
            action: "usage.idempotency_conflict",
            target: event.idempotencyKey,
            detail: "same key, different immutable contents",
          });
          return "conflict";
        }
        return "duplicate";
      }
      throw err;
    }
  }

  async listUsage() {
    const { rows } = await db().query(
      `select * from ai_core.ai_usage order by coalesce(occurred_at, at) asc limit 5000`,
    );
    return rows.map((r) => mapUsage(r as Record<string, unknown>));
  }

  async listSubscriptions() {
    const { rows } = await db().query(`select * from ai_core.ai_subscriptions order by provider_id`);
    return rows.map(
      (r: Record<string, unknown>): SubscriptionRecord => ({
        id: String(r.id),
        providerId: String(r.provider_id),
        plan: String(r.plan),
        amount: r.amount == null ? null : Number(r.amount),
        currency: "USD",
        cadence: String(r.cadence) as SubscriptionRecord["cadence"],
        effectiveDate: String(r.effective_date).slice(0, 10),
        source: String(r.source),
        verificationStatus: String(r.verification_status) as SubscriptionRecord["verificationStatus"],
        notes: String(r.notes || ""),
        kind: String(r.kind) as SubscriptionRecord["kind"],
        domain: String(r.domain) === "mershon_personal" ? "mershon_personal" : "party_perfect",
        partyPerfectAllocationPct: r.party_perfect_allocation_pct == null ? null : Number(r.party_perfect_allocation_pct),
        accountOwner: String(r.account_owner || "Mason"),
        purpose: String(r.purpose || ""),
        renewalDate: r.renewal_date == null ? null : String(r.renewal_date).slice(0, 10),
        active: r.active !== false,
        inactiveDate: r.inactive_date == null ? null : String(r.inactive_date).slice(0, 10),
        updatedAt: new Date(String(r.updated_at)).toISOString(),
        updatedBy: String(r.updated_by || "seed"),
      }),
    );
  }

  async upsertSubscription(row: SubscriptionRecord, actor: string) {
    await db().query(
      `insert into ai_core.ai_subscriptions (
         id, provider_id, plan, amount, currency, cadence, effective_date, source,
         verification_status, notes, kind, domain, party_perfect_allocation_pct,
         account_owner, purpose, renewal_date, updated_at, updated_by
       ) values ($1,$2,$3,$4,'USD',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),$16)
       on conflict (id) do update set
         provider_id=excluded.provider_id, plan=excluded.plan, amount=excluded.amount,
         cadence=excluded.cadence, notes=excluded.notes, verification_status=excluded.verification_status,
         purpose=excluded.purpose, account_owner=excluded.account_owner,
         party_perfect_allocation_pct=excluded.party_perfect_allocation_pct,
         renewal_date=excluded.renewal_date, updated_at=now(), updated_by=excluded.updated_by`,
      [
        row.id,
        row.providerId,
        row.plan,
        row.amount,
        row.cadence,
        row.effectiveDate,
        row.source,
        row.verificationStatus,
        row.notes,
        row.kind,
        row.domain,
        row.partyPerfectAllocationPct,
        row.accountOwner,
        row.purpose,
        row.renewalDate,
        actor,
      ],
    );
    await this.appendAudit({ actor, action: "subscription.upsert", target: row.id, detail: row.plan });
    const all = await this.listSubscriptions();
    return all.find((s) => s.id === row.id)!;
  }

  async listBudgets() {
    const { rows } = await db().query(`select * from ai_core.ai_budgets`);
    return rows.map(
      (r: Record<string, unknown>): BudgetRecord => ({
        id: String(r.id),
        scope: String(r.scope) as BudgetRecord["scope"],
        providerId: r.provider_id == null ? null : String(r.provider_id),
        amountUsd: Number(r.amount_usd),
        period: String(r.period) === "day" ? "day" : "month",
        updatedAt: new Date(String(r.updated_at)).toISOString(),
        updatedBy: String(r.updated_by),
      }),
    );
  }

  async upsertBudget(row: BudgetRecord) {
    await db().query(
      `insert into ai_core.ai_budgets (id, scope, provider_id, amount_usd, period, updated_at, updated_by)
       values ($1,$2,$3,$4,$5,now(),$6)
       on conflict (id) do update set scope=excluded.scope, provider_id=excluded.provider_id,
         amount_usd=excluded.amount_usd, period=excluded.period, updated_at=now(), updated_by=excluded.updated_by`,
      [row.id, row.scope, row.providerId, row.amountUsd, row.period, row.updatedBy],
    );
    await this.appendAudit({ actor: row.updatedBy, action: "budget.upsert", target: row.id, detail: String(row.amountUsd) });
    return row;
  }

  async listAlerts() {
    const { rows } = await db().query(`select * from ai_core.ai_cost_alerts order by last_seen_at desc`);
    return rows.map(
      (r: Record<string, unknown>): CostAlert => ({
        id: String(r.id),
        type: String(r.type),
        severity: String(r.severity) as CostAlert["severity"],
        message: String(r.message),
        dedupeKey: String(r.dedupe_key),
        firstSeenAt: new Date(String(r.first_seen_at)).toISOString(),
        lastSeenAt: new Date(String(r.last_seen_at)).toISOString(),
        count: Number(r.count || 1),
        active: Boolean(r.active),
        acknowledgedAt: r.acknowledged_at ? new Date(String(r.acknowledged_at)).toISOString() : null,
        resolvedAt: r.resolved_at ? new Date(String(r.resolved_at)).toISOString() : null,
      }),
    );
  }

  async upsertAlert(input: Omit<CostAlert, "id" | "firstSeenAt" | "lastSeenAt" | "count" | "active" | "acknowledgedAt" | "resolvedAt"> & { now?: string }) {
    const { rows } = await db().query(
      `insert into ai_core.ai_cost_alerts (type, severity, message, dedupe_key, first_seen_at, last_seen_at, count, active)
       values ($1,$2,$3,$4, now(), now(), 1, true)
       on conflict (dedupe_key) do update set
         last_seen_at=now(), count=ai_core.ai_cost_alerts.count+1, message=excluded.message, severity=excluded.severity, active=true
       returning *`,
      [input.type, input.severity, input.message, input.dedupeKey],
    );
    const r = rows[0] as Record<string, unknown>;
    return {
      id: String(r.id),
      type: String(r.type),
      severity: String(r.severity) as CostAlert["severity"],
      message: String(r.message),
      dedupeKey: String(r.dedupe_key),
      firstSeenAt: new Date(String(r.first_seen_at)).toISOString(),
      lastSeenAt: new Date(String(r.last_seen_at)).toISOString(),
      count: Number(r.count || 1),
      active: Boolean(r.active),
      acknowledgedAt: r.acknowledged_at ? new Date(String(r.acknowledged_at)).toISOString() : null,
      resolvedAt: r.resolved_at ? new Date(String(r.resolved_at)).toISOString() : null,
    };
  }

  async acknowledgeAlert(id: string, actor: string, action: "acknowledge" | "resolve") {
    const { rows } = await db().query(
      action === "resolve"
        ? `update ai_core.ai_cost_alerts set resolved_at=now(), active=false where id=$1 returning *`
        : `update ai_core.ai_cost_alerts set acknowledged_at=now() where id=$1 returning *`,
      [id],
    );
    if (!rows[0]) return null;
    await this.appendAudit({ actor, action: `alert.${action}`, target: id, detail: String(rows[0].type || "") });
    const r = rows[0] as Record<string, unknown>;
    return {
      id: String(r.id),
      type: String(r.type),
      severity: String(r.severity) as CostAlert["severity"],
      message: String(r.message),
      dedupeKey: String(r.dedupe_key),
      firstSeenAt: new Date(String(r.first_seen_at)).toISOString(),
      lastSeenAt: new Date(String(r.last_seen_at)).toISOString(),
      count: Number(r.count || 1),
      active: Boolean(r.active),
      acknowledgedAt: r.acknowledged_at ? new Date(String(r.acknowledged_at)).toISOString() : null,
      resolvedAt: r.resolved_at ? new Date(String(r.resolved_at)).toISOString() : null,
    };
  }

  async listImportRuns() {
    const { rows } = await db().query(`select * from ai_core.ai_usage_import_runs`);
    return rows.map(
      (r: Record<string, unknown>): ImportRun => ({
        collectorId: String(r.collector_id),
        lastSuccessAt: r.last_success_at ? new Date(String(r.last_success_at)).toISOString() : null,
        lastAttemptAt: r.last_attempt_at ? new Date(String(r.last_attempt_at)).toISOString() : null,
        lastError: r.last_error == null ? null : String(r.last_error),
        status: String(r.status) as ImportRun["status"],
      }),
    );
  }

  async recordImportRun(run: ImportRun) {
    await db().query(
      `insert into ai_core.ai_usage_import_runs (collector_id, last_success_at, last_attempt_at, last_error, status)
       values ($1,$2,$3,$4,$5)
       on conflict (collector_id) do update set
         last_success_at=excluded.last_success_at, last_attempt_at=excluded.last_attempt_at,
         last_error=excluded.last_error, status=excluded.status`,
      [run.collectorId, run.lastSuccessAt, run.lastAttemptAt, run.lastError, run.status],
    );
  }

  async listAudit() {
    const { rows } = await db().query(`select * from ai_core.ai_cost_audit order by at desc limit 200`);
    return rows.map(
      (r: Record<string, unknown>): AuditEntry => ({
        at: new Date(String(r.at)).toISOString(),
        actor: String(r.actor),
        action: String(r.action),
        target: String(r.target),
        detail: String(r.detail || ""),
      }),
    );
  }

  async appendAudit(entry: Omit<AuditEntry, "at"> & { at?: string }) {
    await db().query(
      `insert into ai_core.ai_cost_audit (at, actor, action, target, detail) values (coalesce($1::timestamptz, now()), $2, $3, $4, $5)`,
      [entry.at ?? null, entry.actor, entry.action, entry.target, entry.detail],
    );
  }
}
