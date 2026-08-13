import type { CostClass, VerificationStatus } from "@/lib/ai-cost-math";
import type { BillingCadence, CostDomain, CostKind } from "@/lib/ai-cost-policy";

export type UsageSource =
  | "app_event"
  | "local_collector"
  | "provider_export"
  | "governor_ledger"
  | "manual";

export type UsageEvent = {
  eventId: string;
  occurredAt: string;
  ingestedAt: string;
  agentId: string;
  taskId: string | null;
  correlationId: string | null;
  provider: string;
  model: string | null;
  operation: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  cachedOutputTokens: number | null;
  reasoningTokens: number | null;
  requestCount: number;
  audioSeconds: number | null;
  transcriptionSeconds: number | null;
  imageCount: number | null;
  storageBytes: number | null;
  computeMs: number | null;
  extraUnits: Record<string, number> | null;
  causationId: string | null;
  usageKind: "included" | "overage" | "metered" | null;
  fingerprint: string;
  retries: number;
  success: boolean | null;
  estimatedCostUsd: number | null;
  verifiedCostUsd: number | null;
  rateVersion: string | null;
  domain: CostDomain;
  source: UsageSource;
  idempotencyKey: string;
  providerEventRef: string | null;
  verificationStatus: VerificationStatus;
  humanTriggered: boolean;
  status: string;
};

export type SubscriptionRecord = {
  id: string;
  providerId: string;
  plan: string;
  amount: number | null;
  currency: "USD";
  cadence: BillingCadence;
  effectiveDate: string;
  source: string;
  verificationStatus: VerificationStatus;
  notes: string;
  kind: CostKind;
  domain: CostDomain;
  partyPerfectAllocationPct: number | null;
  accountOwner: string;
  purpose: string;
  renewalDate: string | null;
  active: boolean;
  inactiveDate: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type BudgetRecord = {
  id: string;
  scope: "overall" | "provider" | "daily_metered";
  providerId: string | null;
  amountUsd: number;
  period: "day" | "month";
  updatedAt: string;
  updatedBy: string;
};

export type CostAlert = {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  dedupeKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  active: boolean;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
};

export type ImportRun = {
  collectorId: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  status: "ok" | "stale" | "never" | "failed";
};

export type AuditEntry = {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
};

export type Freshness = {
  usageLastIngestedAt: string | null;
  collectors: ImportRun[];
  stale: boolean;
  label: string;
};

export type MoneyDisplay = {
  display: string;
  known: number;
  unknownCount: number;
  class: CostClass | "MIXED";
  verification: VerificationStatus | "MIXED";
};

export type ExecutiveSummary = {
  timezone: "America/Chicago";
  asOf: string;
  period: { day: string; month: string };
  fixedMonthly: MoneyDisplay;
  meteredToday: MoneyDisplay;
  meteredThisMonth: MoneyDisplay;
  infrastructureThisMonth: MoneyDisplay;
  estimatedTotalThisMonth: MoneyDisplay;
  providerVerifiedTotal: MoneyDisplay;
  projectedMonthEnd: {
    display: string;
    value: number | null;
    basis: string;
    confidence: "none" | "low" | "medium";
    includesFixed: boolean;
  };
  monthOverMonth: string;
  unattributedUsage: { count: number; display: string };
  dataFreshness: Freshness;
  coverage: CoverageRow[];
  activeAlertCount: number;
  guardrail: string;
  computeGovernor: unknown | null;
};

export type CoverageRow = {
  providerId: string;
  collector: "live" | "manual" | "none" | "failed" | "stale";
  lastSuccessAt: string | null;
  lastFailure: string | null;
  usageApi: "available" | "unknown" | "none";
  note: string;
};

export type ProviderCostRow = {
  providerId: string;
  label: string;
  plan: string;
  fixedRecurring: MoneyDisplay;
  metered: MoneyDisplay;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cachedTokens: number | null;
    requests: number;
    audioSeconds: number | null;
  };
  billingPeriod: string;
  projection: string;
  dataSource: string;
  lastSyncedAt: string | null;
  verificationStatus: VerificationStatus | "MIXED";
  budget: string;
  alertStatus: string;
  agents: string[];
};

export type AgentCostRow = {
  agentId: string;
  label: string;
  tasksStarted: number;
  tasksCompleted: number;
  tasksFailed: number;
  modelCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  audioSeconds: number | null;
  estimatedIncremental: MoneyDisplay;
  verifiedBilled: MoneyDisplay;
  avgCostPerCompletedTask: string;
  highestCostTask: { taskId: string; display: string } | null;
  retryCost: MoneyDisplay;
  duplicateWorkCost: MoneyDisplay;
  dateRange: string;
  billedAccuracyNote: string;
};

export type TaskCostRow = {
  taskId: string | null;
  agentId: string;
  provider: string;
  model: string | null;
  startAt: string;
  endAt: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  estimatedCostUsd: number | null;
  estimatedDisplay: string;
  retryCount: number;
  status: string;
  domain: CostDomain;
  correlationId: string | null;
  humanTriggered: boolean;
};

export type IngestResult = {
  accepted: number;
  duplicates: number;
  conflicts: number;
  rejected: number;
  errors: string[];
};
