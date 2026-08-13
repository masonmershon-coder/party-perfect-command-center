import { randomUUID } from "node:crypto";
import { immutableUsageFingerprint } from "@/lib/ai-cost-math";
import {
  SEED_SUBSCRIPTIONS,
  type CostDomain,
} from "@/lib/ai-cost-policy";
import type {
  AuditEntry,
  BudgetRecord,
  CostAlert,
  ImportRun,
  SubscriptionRecord,
  UsageEvent,
} from "@/lib/ai-cost-types";

export type UsageInsertResult = "accepted" | "duplicate" | "conflict";

export type AiCostStore = {
  insertUsage(event: UsageEvent): Promise<UsageInsertResult>;
  listUsage(): Promise<UsageEvent[]>;
  listSubscriptions(): Promise<SubscriptionRecord[]>;
  upsertSubscription(row: SubscriptionRecord, actor: string): Promise<SubscriptionRecord>;
  listBudgets(): Promise<BudgetRecord[]>;
  upsertBudget(row: BudgetRecord): Promise<BudgetRecord>;
  listAlerts(): Promise<CostAlert[]>;
  upsertAlert(alert: Omit<CostAlert, "id" | "firstSeenAt" | "lastSeenAt" | "count" | "active" | "acknowledgedAt" | "resolvedAt"> & {
    now?: string;
  }): Promise<CostAlert>;
  acknowledgeAlert(id: string, actor: string, action: "acknowledge" | "resolve"): Promise<CostAlert | null>;
  listImportRuns(): Promise<ImportRun[]>;
  recordImportRun(run: ImportRun): Promise<void>;
  listAudit(): Promise<AuditEntry[]>;
  appendAudit(entry: Omit<AuditEntry, "at"> & { at?: string }): Promise<void>;
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function seedSubscriptionRecords(now = new Date().toISOString()): SubscriptionRecord[] {
  return SEED_SUBSCRIPTIONS.map((s) => ({
    ...s,
    renewalDate: null,
    inactiveDate: null,
    updatedAt: now,
    updatedBy: "seed",
  }));
}

export function createMemoryAiCostStore(now = () => new Date().toISOString()): AiCostStore {
  const usage = new Map<string, UsageEvent>();
  const subscriptions = new Map<string, SubscriptionRecord>(
    seedSubscriptionRecords(now()).map((s) => [s.id, s]),
  );
  const budgets = new Map<string, BudgetRecord>();
  const alerts = new Map<string, CostAlert>();
  const importRuns = new Map<string, ImportRun>();
  const audit: AuditEntry[] = [];

  return {
    async insertUsage(event) {
      const existing = usage.get(event.idempotencyKey);
      if (existing) {
        const prev = existing.fingerprint || immutableUsageFingerprint(existing);
        const next = event.fingerprint || immutableUsageFingerprint(event);
        if (prev !== next) {
          audit.push({
            at: now(),
            actor: "collector",
            action: "usage.idempotency_conflict",
            target: event.idempotencyKey,
            detail: "same key, different immutable contents",
          });
          return "conflict";
        }
        return "duplicate";
      }
      usage.set(event.idempotencyKey, clone(event));
      return "accepted";
    },
    async listUsage() {
      return [...usage.values()].map(clone).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
    async listSubscriptions() {
      return [...subscriptions.values()].map(clone);
    },
    async upsertSubscription(row, actor) {
      const prev = subscriptions.get(row.id);
      subscriptions.set(row.id, clone({ ...row, updatedAt: now(), updatedBy: actor }));
      audit.push({
        at: now(),
        actor,
        action: prev ? "subscription.update" : "subscription.create",
        target: row.id,
        detail: `${row.providerId} ${row.plan}`,
      });
      return clone(subscriptions.get(row.id)!);
    },
    async listBudgets() {
      return [...budgets.values()].map(clone);
    },
    async upsertBudget(row) {
      budgets.set(row.id, clone({ ...row, updatedAt: now() }));
      audit.push({
        at: now(),
        actor: row.updatedBy,
        action: "budget.upsert",
        target: row.id,
        detail: `${row.scope} ${row.amountUsd}`,
      });
      return clone(budgets.get(row.id)!);
    },
    async listAlerts() {
      return [...alerts.values()].map(clone);
    },
    async upsertAlert(input) {
      const at = input.now ?? now();
      const existing = alerts.get(input.dedupeKey);
      if (existing && existing.active) {
        existing.lastSeenAt = at;
        existing.count += 1;
        existing.message = input.message;
        existing.severity = input.severity;
        return clone(existing);
      }
      const alert: CostAlert = {
        id: randomUUID(),
        type: input.type,
        severity: input.severity,
        message: input.message,
        dedupeKey: input.dedupeKey,
        firstSeenAt: at,
        lastSeenAt: at,
        count: 1,
        active: true,
        acknowledgedAt: null,
        resolvedAt: null,
      };
      alerts.set(input.dedupeKey, alert);
      return clone(alert);
    },
    async acknowledgeAlert(id, actor, action) {
      for (const alert of alerts.values()) {
        if (alert.id !== id) continue;
        const at = now();
        if (action === "acknowledge") alert.acknowledgedAt = at;
        if (action === "resolve") {
          alert.resolvedAt = at;
          alert.active = false;
        }
        audit.push({ at, actor, action: `alert.${action}`, target: id, detail: alert.type });
        return clone(alert);
      }
      return null;
    },
    async listImportRuns() {
      return [...importRuns.values()].map(clone);
    },
    async recordImportRun(run) {
      importRuns.set(run.collectorId, clone(run));
    },
    async listAudit() {
      return audit.map(clone);
    },
    async appendAudit(entry) {
      audit.push({ at: entry.at ?? now(), actor: entry.actor, action: entry.action, target: entry.target, detail: entry.detail });
    },
  };
}

export function assertDomain(value: string): CostDomain {
  if (value === "party_perfect" || value === "mershon_personal") return value;
  throw new Error("invalid domain");
}
