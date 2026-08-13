/**
 * Owner AI Cost & Usage engine. Deterministic aggregation. Does not invent usage.
 */
import { randomUUID } from "node:crypto";
import {
  AI_COST_TZ,
  addKnown,
  bucketKnownUsd,
  calculateTokenCost,
  chicagoDayBounds,
  chicagoMonthBounds,
  chicagoYmd,
  csvEscape,
  displayMoney,
  immutableUsageFingerprint,
  isFutureDated,
  momChange,
  moneyBucket,
  payloadHasSecret,
  projectMonthEnd,
  prorateFixedForMonth,
  roundUsd6,
  selectRate,
  type RateRow,
} from "@/lib/ai-cost-math";
import {
  AI_COST_ALERT_DEDUP_WINDOW_MS,
  AI_COST_INGEST_MAX_BYTES,
  AI_COST_INGEST_MAX_EVENTS,
  KNOWN_AGENTS,
  KNOWN_PROVIDERS,
  SPENDING_GUARDRAIL,
  type CostDomain,
} from "@/lib/ai-cost-policy";
import type { AiCostStore } from "@/lib/ai-cost-store";
import { assertDomain } from "@/lib/ai-cost-store";
import type {
  AgentCostRow,
  AuditEntry,
  BudgetRecord,
  CostAlert,
  CoverageRow,
  ExecutiveSummary,
  Freshness,
  IngestResult,
  MoneyDisplay,
  ProviderCostRow,
  SubscriptionRecord,
  TaskCostRow,
  UsageEvent,
  UsageSource,
} from "@/lib/ai-cost-types";
import type { VerificationStatus } from "@/lib/ai-cost-math";

export type AiCostEngine = {
  store: AiCostStore;
  rates: RateRow[];
  now: () => Date;
  governorPayload?: unknown | null;
};

const STALE_MS = 36 * 60 * 60 * 1000;

function fromBucket(
  bucket: ReturnType<typeof moneyBucket>,
  cls: MoneyDisplay["class"],
  verification: MoneyDisplay["verification"],
): MoneyDisplay {
  return {
    display: displayMoney(bucket),
    known: roundUsd6(bucketKnownUsd(bucket)),
    unknownCount: bucket.unknownCount,
    class: cls,
    verification,
  };
}

function isBillableMetered(ev: UsageEvent): boolean {
  return ev.usageKind !== "included";
}

export function buildCoverage(input: {
  runs: Awaited<ReturnType<AiCostStore["listImportRuns"]>>;
  subs: SubscriptionRecord[];
}): CoverageRow[] {
  return KNOWN_PROVIDERS.map((p) => {
    const run = input.runs.find((r) => r.collectorId === p.id || r.collectorId.startsWith(`${p.id}:`));
    const sub = input.subs.find((s) => s.providerId === p.id);
    let collector: CoverageRow["collector"] = "none";
    if (run?.status === "ok") collector = "live";
    else if (run?.status === "failed") collector = "failed";
    else if (run?.status === "stale") collector = "stale";
    else if (sub) collector = "manual";
    const usageApi =
      p.id === "transcription" || p.id === "embeddings" || p.id === "cursor" || p.id === "github"
        ? "unknown"
        : p.id === "supabase" || p.id === "vercel"
          ? "none"
          : "available";
    return {
      providerId: p.id,
      collector,
      lastSuccessAt: run?.lastSuccessAt ?? null,
      lastFailure: run?.lastError ?? null,
      usageApi,
      note:
        collector === "none"
          ? "No collector heartbeat. UNAVAILABLE, not $0."
          : collector === "manual"
            ? "USER_REPORTED ledger only."
            : collector === "failed"
              ? "Last collection failed. STALE, not $0."
              : usageApi === "none"
                ? "Provider has no usage API; subscription/infra only."
                : "Collector present.",
    };
  });
}

export function freshnessFromRuns(
  runs: Awaited<ReturnType<AiCostStore["listImportRuns"]>>,
  usage: UsageEvent[],
  nowMs = Date.now(),
): Freshness {
  const lastUsage = usage.reduce<string | null>((acc, ev) => {
    if (!acc || ev.ingestedAt > acc) return ev.ingestedAt;
    return acc;
  }, null);
  const collectors = runs.map((r) => {
    if (!r.lastSuccessAt && !r.lastAttemptAt) return { ...r, status: "never" as const };
    if (r.lastError && !r.lastSuccessAt) return { ...r, status: "failed" as const };
    if (r.lastSuccessAt && nowMs - Date.parse(r.lastSuccessAt) > STALE_MS) {
      return { ...r, status: "stale" as const };
    }
    return { ...r, status: r.lastError ? ("failed" as const) : ("ok" as const) };
  });
  const stale =
    collectors.some((c) => c.status === "stale" || c.status === "failed" || c.status === "never") ||
    (collectors.length === 0 && usage.length === 0);
  const label = stale
    ? collectors.some((c) => c.status === "failed")
      ? "STALE — collector failure (not $0)"
      : collectors.length === 0
        ? "UNAVAILABLE — no collector heartbeat"
        : "STALE — last success older than 36h"
    : "FRESH";
  return { usageLastIngestedAt: lastUsage, collectors, stale, label };
}

function providerLabel(id: string): string {
  return KNOWN_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

function agentLabel(id: string): string {
  return KNOWN_AGENTS.find((a) => a.id === id)?.label ?? id;
}

export async function buildExecutiveSummary(engine: AiCostEngine): Promise<ExecutiveSummary> {
  const now = engine.now();
  const usage = await engine.store.listUsage();
  const subs = await engine.store.listSubscriptions();
  const alerts = (await engine.store.listAlerts()).filter((a) => a.active);
  const runs = await engine.store.listImportRuns();
  const day = chicagoDayBounds(now);
  const month = chicagoMonthBounds(now);
  const prevMonthEnd = new Date(month.start.getTime() - 1000);
  const prevMonth = chicagoMonthBounds(prevMonthEnd);

  const fixed = moneyBucket();
  for (const s of subs) {
    if (s.kind !== "fixed") continue;
    addKnown(
      fixed,
      prorateFixedForMonth({
        amount: s.amount,
        cadence: s.cadence,
        effectiveDate: s.effectiveDate,
        active: s.active,
        inactiveDate: s.inactiveDate,
        monthStart: month.start,
        monthEnd: month.end,
      }),
    );
  }

  const infraMonth = moneyBucket();
  for (const s of subs) {
    if (s.kind !== "infrastructure") continue;
    addKnown(
      infraMonth,
      prorateFixedForMonth({
        amount: s.amount,
        cadence: s.cadence,
        effectiveDate: s.effectiveDate,
        active: s.active,
        inactiveDate: s.inactiveDate,
        monthStart: month.start,
        monthEnd: month.end,
      }),
    );
  }

  const meteredToday = moneyBucket();
  const meteredMonth = moneyBucket();
  const verifiedMonth = moneyBucket();
  const prevMetered = moneyBucket();
  let unattributed = 0;

  for (const ev of usage) {
    if (ev.domain === "mershon_personal") continue;
    if (!isBillableMetered(ev)) continue;
    const estimated = ev.estimatedCostUsd;
    const verified = ev.verifiedCostUsd;
    if (!ev.agentId || ev.agentId === "unknown") unattributed += 1;
    if (inIso(ev.occurredAt, day.start, day.end)) addKnown(meteredToday, estimated);
    if (inIso(ev.occurredAt, month.start, month.end)) {
      addKnown(meteredMonth, estimated);
      addKnown(verifiedMonth, verified);
    }
    if (inIso(ev.occurredAt, prevMonth.start, prevMonth.end)) {
      addKnown(prevMetered, estimated);
    }
  }

  const fresh = freshnessFromRuns(runs, usage, now.getTime());
  const noMeteredEvidence = usage.filter((e) => e.domain === "party_perfect").length === 0;
  const meteredTodayDisplay =
    fresh.stale && noMeteredEvidence
      ? {
          display: "UNAVAILABLE (collector stale — not $0)",
          known: 0,
          unknownCount: 1,
          class: "UNKNOWN" as const,
          verification: "UNAVAILABLE" as const,
        }
      : fromBucket(meteredToday, "ESTIMATED", "UNVERIFIED");
  const meteredMonthDisplay =
    fresh.stale && noMeteredEvidence
      ? {
          display: "UNAVAILABLE (collector stale — not $0)",
          known: 0,
          unknownCount: 1,
          class: "UNKNOWN" as const,
          verification: "UNAVAILABLE" as const,
        }
      : fromBucket(meteredMonth, "ESTIMATED", "UNVERIFIED");

  const projection = projectMonthEnd({
    monthToDateKnown: bucketKnownUsd(meteredMonth),
    knownCount: meteredMonth.knownCount,
    unknownCount: meteredMonth.unknownCount,
    dayOfMonth: month.dayOfMonth,
    daysInMonth: month.daysInMonth,
  });
  const fixedUsd = bucketKnownUsd(fixed);
  const infraUsd = bucketKnownUsd(infraMonth);
  const meteredUsd = bucketKnownUsd(meteredMonth);
  const prevUsd = bucketKnownUsd(prevMetered);

  const projectedWithFixed =
    projection.value == null && fixed.unknownCount > 0
      ? {
          display: "UNKNOWN",
          value: null as number | null,
          basis: "fixed subscriptions include UNKNOWN amounts; metered projection unavailable",
          confidence: "none" as const,
          includesFixed: true,
        }
      : projection.value == null
        ? {
            display: displayMoney(fixed),
            value: fixed.unknownCount ? null : roundUsd6(fixedUsd + infraUsd),
            basis: "fixed + infrastructure only; no known metered spend. Not provider truth.",
            confidence: fixed.unknownCount ? ("none" as const) : ("low" as const),
            includesFixed: true,
          }
        : {
            display:
              fixed.unknownCount > 0
                ? `$${roundUsd6(projection.value + fixedUsd + infraUsd).toFixed(2)} + ${fixed.unknownCount} UNKNOWN fixed`
                : `$${roundUsd6(projection.value + fixedUsd + infraUsd).toFixed(2)}`,
            value: roundUsd6(projection.value + fixedUsd + infraUsd),
            basis: `${projection.basis}; plus USER_REPORTED fixed/infra (not provider-verified). Sparse extrapolation is not billing truth.`,
            confidence: projection.confidence,
            includesFixed: true,
          };

  return {
    timezone: AI_COST_TZ,
    asOf: now.toISOString(),
    period: { day: day.ymd, month: month.key },
    fixedMonthly: fromBucket(fixed, "FIXED_SUBSCRIPTION", "USER_REPORTED"),
    meteredToday: meteredTodayDisplay,
    meteredThisMonth: meteredMonthDisplay,
    infrastructureThisMonth: fromBucket(infraMonth, "INFRASTRUCTURE", "UNVERIFIED"),
    estimatedTotalThisMonth: {
      display:
        meteredMonth.unknownCount + fixed.unknownCount + infraMonth.unknownCount > 0
          ? `$${roundUsd6(fixedUsd + infraUsd + meteredUsd).toFixed(2)} + ${meteredMonth.unknownCount + fixed.unknownCount + infraMonth.unknownCount} UNKNOWN (est+fixed, not verified)`
          : `$${roundUsd6(fixedUsd + infraUsd + meteredUsd).toFixed(2)} (est+fixed, not verified)`,
      known: roundUsd6(fixedUsd + infraUsd + meteredUsd),
      unknownCount: meteredMonth.unknownCount + fixed.unknownCount + infraMonth.unknownCount,
      class: "MIXED",
      verification: "MIXED",
    },
    providerVerifiedTotal: fromBucket(verifiedMonth, "ACTUAL", "PROVIDER_VERIFIED"),
    projectedMonthEnd: projectedWithFixed,
    monthOverMonth: momChange(
      meteredMonth.knownCount ? meteredUsd : null,
      prevMetered.knownCount ? prevUsd : null,
    ),
    unattributedUsage: {
      count: unattributed,
      display: unattributed ? `${unattributed} unattributed event(s)` : "none",
    },
    dataFreshness: fresh,
    coverage: buildCoverage({ runs, subs }),
    activeAlertCount: alerts.length,
    guardrail: SPENDING_GUARDRAIL,
    computeGovernor: engine.governorPayload ?? null,
  };
}

function inIso(iso: string, start: Date, end: Date): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
}

export async function buildProviderRows(engine: AiCostEngine): Promise<ProviderCostRow[]> {
  const now = engine.now();
  const month = chicagoMonthBounds(now);
  const usage = await engine.store.listUsage();
  const subs = await engine.store.listSubscriptions();
  const budgets = await engine.store.listBudgets();
  const alerts = (await engine.store.listAlerts()).filter((a) => a.active);
  const runs = await engine.store.listImportRuns();
  const ids = new Set<string>([
    ...KNOWN_PROVIDERS.map((p) => p.id),
    ...subs.map((s) => s.providerId),
    ...usage.map((u) => u.provider),
  ]);

  return [...ids].sort().map((providerId) => {
    const sub = subs.filter((s) => s.providerId === providerId);
    const events = usage.filter(
      (e) => e.provider === providerId && e.domain === "party_perfect" && inIso(e.occurredAt, month.start, month.end),
    );
    const fixed = moneyBucket();
    for (const s of sub.filter((x) => x.kind === "fixed")) {
      addKnown(
        fixed,
        prorateFixedForMonth({
          amount: s.amount,
          cadence: s.cadence,
          effectiveDate: s.effectiveDate,
          active: s.active,
          inactiveDate: s.inactiveDate,
          monthStart: month.start,
          monthEnd: month.end,
        }),
      );
    }
    const metered = moneyBucket();
    let inputTokens: number | null = 0;
    let outputTokens: number | null = 0;
    let cachedTokens: number | null = 0;
    let audioSeconds: number | null = 0;
    let sawTokens = false;
    let sawAudio = false;
    for (const ev of events) {
      if (isBillableMetered(ev)) addKnown(metered, ev.estimatedCostUsd);
      if (ev.inputTokens != null) {
        sawTokens = true;
        inputTokens = (inputTokens ?? 0) + ev.inputTokens;
      }
      if (ev.outputTokens != null) {
        sawTokens = true;
        outputTokens = (outputTokens ?? 0) + ev.outputTokens;
      }
      if (ev.cachedTokens != null) {
        sawTokens = true;
        cachedTokens = (cachedTokens ?? 0) + ev.cachedTokens;
      }
      if (ev.audioSeconds != null) {
        sawAudio = true;
        audioSeconds = (audioSeconds ?? 0) + ev.audioSeconds;
      }
    }
    const projection = projectMonthEnd({
      monthToDateKnown: bucketKnownUsd(metered),
      knownCount: metered.knownCount,
      unknownCount: metered.unknownCount,
      dayOfMonth: month.dayOfMonth,
      daysInMonth: month.daysInMonth,
    });
    const budget = budgets.find((b) => b.scope === "provider" && b.providerId === providerId);
    const alert = alerts.filter((a) => a.dedupeKey.includes(`:${providerId}:`) || a.message.includes(providerId));
    const collector = runs.find((r) => r.collectorId === providerId || r.collectorId.startsWith(`${providerId}:`));
    const verification = sub.some((s) => s.verificationStatus === "PROVIDER_VERIFIED")
      ? "PROVIDER_VERIFIED"
      : sub.some((s) => s.verificationStatus === "USER_REPORTED")
        ? "USER_REPORTED"
        : events.length
          ? "UNVERIFIED"
          : "UNAVAILABLE";
    return {
      providerId,
      label: providerLabel(providerId),
      plan: sub[0]?.plan ?? (events.length ? "metered / unknown plan" : "UNAVAILABLE"),
      fixedRecurring: fromBucket(fixed, "FIXED_SUBSCRIPTION", verification),
      metered: fromBucket(metered, "ESTIMATED", events.length ? "UNVERIFIED" : "UNAVAILABLE"),
      usage: {
        inputTokens: sawTokens ? inputTokens : null,
        outputTokens: sawTokens ? outputTokens : null,
        cachedTokens: sawTokens ? cachedTokens : null,
        requests: events.length,
        audioSeconds: sawAudio ? audioSeconds : null,
      },
      billingPeriod: month.key,
      projection: projection.display,
      dataSource: collector ? `collector:${collector.collectorId}` : sub.length ? "USER_REPORTED ledger" : "UNAVAILABLE",
      lastSyncedAt: collector?.lastSuccessAt ?? null,
      verificationStatus: verification,
      budget: budget ? `$${budget.amountUsd.toFixed(2)} / ${budget.period}` : "not configured",
      alertStatus: alert.length ? `${alert.length} active` : "none",
      agents: [
        ...new Set([
          ...(KNOWN_PROVIDERS.find((p) => p.id === providerId)?.agents ?? []),
          ...events.map((e) => e.agentId),
        ]),
      ],
    };
  });
}

export async function buildAgentRows(engine: AiCostEngine): Promise<AgentCostRow[]> {
  const now = engine.now();
  const month = chicagoMonthBounds(now);
  const usage = (await engine.store.listUsage()).filter(
    (e) => e.domain === "party_perfect" && inIso(e.occurredAt, month.start, month.end),
  );
  const ids = new Set<string>([...KNOWN_AGENTS.map((a) => a.id), ...usage.map((u) => u.agentId)]);
  const byTask = new Map<string, UsageEvent[]>();
  for (const ev of usage) {
    const key = ev.taskId || ev.correlationId || ev.eventId;
    const list = byTask.get(key) || [];
    list.push(ev);
    byTask.set(key, list);
  }

  return [...ids].sort().map((agentId) => {
    const events = usage.filter((e) => e.agentId === agentId);
    const taskIds = [...new Set(events.map((e) => e.taskId).filter(Boolean))] as string[];
    const completed = events.filter((e) => e.status === "completed" || e.success === true);
    const failed = events.filter((e) => e.status === "failed" || e.success === false);
    const estimated = moneyBucket();
    const verified = moneyBucket();
    const retryCost = moneyBucket();
    const dupCost = moneyBucket();
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let cachedTokens: number | null = null;
    let audioSeconds: number | null = null;
    for (const ev of events) {
      if (isBillableMetered(ev)) addKnown(estimated, ev.estimatedCostUsd);
      addKnown(verified, ev.verifiedCostUsd);
      if (ev.retries > 0 && isBillableMetered(ev)) addKnown(retryCost, ev.estimatedCostUsd);
      if (ev.inputTokens != null) inputTokens = (inputTokens ?? 0) + ev.inputTokens;
      if (ev.outputTokens != null) outputTokens = (outputTokens ?? 0) + ev.outputTokens;
      if (ev.cachedTokens != null) cachedTokens = (cachedTokens ?? 0) + ev.cachedTokens;
      if (ev.audioSeconds != null) audioSeconds = (audioSeconds ?? 0) + ev.audioSeconds;
    }
    const seenFingerprints = new Map<string, number>();
    for (const ev of events) {
      const fp = `${ev.provider}|${ev.model}|${ev.operation}|${ev.inputTokens}|${ev.outputTokens}`;
      seenFingerprints.set(fp, (seenFingerprints.get(fp) || 0) + 1);
    }
    for (const ev of events) {
      const fp = `${ev.provider}|${ev.model}|${ev.operation}|${ev.inputTokens}|${ev.outputTokens}`;
      if ((seenFingerprints.get(fp) || 0) > 1) addKnown(dupCost, ev.estimatedCostUsd);
    }
    let highest: { taskId: string; display: string } | null = null;
    let highestAmt = -1;
    for (const [taskId, list] of byTask) {
      if (!list.some((e) => e.agentId === agentId)) continue;
      const sum = list.reduce((a, e) => a + (e.estimatedCostUsd ?? 0), 0);
      if (sum > highestAmt && list.some((e) => e.estimatedCostUsd != null)) {
        highestAmt = sum;
        highest = { taskId, display: `$${sum.toFixed(4)} (estimated)` };
      }
    }
    const completedTaskCount = new Set(completed.map((e) => e.taskId).filter(Boolean)).size;
    const avg =
      completedTaskCount && estimated.knownCount
        ? `$${(bucketKnownUsd(estimated) / completedTaskCount).toFixed(4)} estimated`
        : "UNKNOWN";
    return {
      agentId,
      label: agentLabel(agentId),
      tasksStarted: taskIds.length,
      tasksCompleted: completedTaskCount,
      tasksFailed: new Set(failed.map((e) => e.taskId).filter(Boolean)).size,
      modelCalls: events.length,
      inputTokens,
      outputTokens,
      cachedTokens,
      audioSeconds,
      estimatedIncremental: fromBucket(estimated, "ESTIMATED", "UNVERIFIED"),
      verifiedBilled: fromBucket(verified, "ACTUAL", verified.knownCount ? "PROVIDER_VERIFIED" : "UNAVAILABLE"),
      avgCostPerCompletedTask: avg,
      highestCostTask: highest,
      retryCost: fromBucket(retryCost, "ESTIMATED", "UNVERIFIED"),
      duplicateWorkCost: fromBucket(dupCost, "ESTIMATED", "UNVERIFIED"),
      dateRange: `${chicagoYmd(month.start)} → ${chicagoYmd(new Date(month.end.getTime() - 1000))} (${AI_COST_TZ})`,
      billedAccuracyNote:
        verified.knownCount === 0
          ? "Provider totals are account-level unless a verified allocation is ingested. Do not treat estimated agent cost as billed truth."
          : "Verified billed amounts shown only where provider allocation was ingested.",
    };
  });
}

export async function buildTaskRows(engine: AiCostEngine, domain?: CostDomain): Promise<TaskCostRow[]> {
  const usage = await engine.store.listUsage();
  return usage
    .filter((e) => (domain ? e.domain === domain : true))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 500)
    .map((e) => ({
      taskId: e.taskId,
      agentId: e.agentId,
      provider: e.provider,
      model: e.model,
      startAt: e.occurredAt,
      endAt: e.ingestedAt,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      cachedTokens: e.cachedTokens,
      estimatedCostUsd: e.estimatedCostUsd,
      estimatedDisplay:
        e.estimatedCostUsd == null ? "UNKNOWN" : `$${e.estimatedCostUsd.toFixed(6)} estimated`,
      retryCount: e.retries,
      status: e.status,
      domain: e.domain,
      correlationId: e.correlationId,
      humanTriggered: e.humanTriggered,
    }));
}

export type IngestEventInput = {
  idempotencyKey: string;
  occurredAt: string;
  agentId: string;
  taskId?: string | null;
  correlationId?: string | null;
  provider: string;
  model?: string | null;
  operation?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  audioSeconds?: number | null;
  retries?: number;
  success?: boolean | null;
  estimatedCostUsd?: number | null;
  verifiedCostUsd?: number | null;
  rateVersion?: string | null;
  domain?: string;
  source?: UsageSource;
  providerEventRef?: string | null;
  humanTriggered?: boolean;
  status?: string;
  causationId?: string | null;
  cachedOutputTokens?: number | null;
  reasoningTokens?: number | null;
  requestCount?: number;
  transcriptionSeconds?: number | null;
  imageCount?: number | null;
  storageBytes?: number | null;
  computeMs?: number | null;
  extraUnits?: Record<string, number> | null;
  usageKind?: "included" | "overage" | "metered" | null;
};

export async function ingestUsageEvents(
  engine: AiCostEngine,
  events: IngestEventInput[],
  opts?: { payloadBytes?: number; nowIso?: string },
): Promise<IngestResult> {
  const errors: string[] = [];
  if ((opts?.payloadBytes ?? 0) > AI_COST_INGEST_MAX_BYTES) {
    return { accepted: 0, duplicates: 0, conflicts: 0, rejected: 1, errors: ["payload_too_large"] };
  }
  if (events.length > AI_COST_INGEST_MAX_EVENTS) {
    return { accepted: 0, duplicates: 0, conflicts: 0, rejected: events.length, errors: ["too_many_events"] };
  }
  if (payloadHasSecret(events)) {
    return { accepted: 0, duplicates: 0, conflicts: 0, rejected: events.length, errors: ["secret_in_payload"] };
  }
  let accepted = 0;
  let duplicates = 0;
  let conflicts = 0;
  let rejected = 0;
  const nowIso = opts?.nowIso ?? engine.now().toISOString();

  for (const raw of events) {
    try {
      if (!raw.idempotencyKey || !raw.occurredAt || !raw.agentId || !raw.provider) {
        rejected += 1;
        errors.push("missing_required_fields");
        continue;
      }
      if (isFutureDated(raw.occurredAt, Date.parse(nowIso))) {
        rejected += 1;
        errors.push("future_dated");
        continue;
      }
      const domain = assertDomain(raw.domain || "party_perfect");
      let estimated = raw.estimatedCostUsd ?? null;
      let rateVersion = raw.rateVersion ?? null;
      if (estimated == null) {
        const rate = selectRate(
          engine.rates,
          raw.provider,
          raw.model || "*",
          raw.occurredAt,
        );
        const calc = calculateTokenCost({
          inputTokens: raw.inputTokens ?? null,
          outputTokens: raw.outputTokens ?? null,
          cachedTokens: raw.cachedTokens ?? null,
          rate,
        });
        estimated = calc.amount;
        rateVersion = rate?.version ?? rateVersion;
      }
      const event: UsageEvent = {
        eventId: randomUUID(),
        occurredAt: new Date(raw.occurredAt).toISOString(),
        ingestedAt: nowIso,
        agentId: String(raw.agentId).slice(0, 64),
        taskId: raw.taskId ? String(raw.taskId).slice(0, 80) : null,
        correlationId: raw.correlationId ? String(raw.correlationId).slice(0, 80) : raw.taskId ?? null,
        provider: String(raw.provider).slice(0, 64),
        model: raw.model ? String(raw.model).slice(0, 80) : null,
        operation: String(raw.operation || "unknown").slice(0, 64),
        inputTokens: raw.inputTokens ?? null,
        outputTokens: raw.outputTokens ?? null,
        cachedTokens: raw.cachedTokens ?? null,
        cachedOutputTokens: raw.cachedOutputTokens ?? null,
        reasoningTokens: raw.reasoningTokens ?? null,
        requestCount: Math.max(1, Number(raw.requestCount || 1)),
        audioSeconds: raw.audioSeconds ?? null,
        transcriptionSeconds: raw.transcriptionSeconds ?? null,
        imageCount: raw.imageCount ?? null,
        storageBytes: raw.storageBytes ?? null,
        computeMs: raw.computeMs ?? null,
        extraUnits: raw.extraUnits && typeof raw.extraUnits === "object" ? raw.extraUnits : null,
        causationId: raw.causationId ? String(raw.causationId).slice(0, 80) : null,
        usageKind: raw.usageKind === "included" || raw.usageKind === "overage" || raw.usageKind === "metered" ? raw.usageKind : null,
        fingerprint: "",
        retries: Number(raw.retries || 0),
        success: raw.success ?? null,
        estimatedCostUsd: estimated == null ? null : roundUsd6(estimated),
        verifiedCostUsd: raw.verifiedCostUsd == null ? null : roundUsd6(raw.verifiedCostUsd),
        rateVersion,
        domain,
        source: raw.source || "local_collector",
        idempotencyKey: String(raw.idempotencyKey).slice(0, 160),
        providerEventRef: raw.providerEventRef ? String(raw.providerEventRef).slice(0, 120) : null,
        verificationStatus: raw.verifiedCostUsd != null ? "PROVIDER_VERIFIED" : estimated != null ? "UNVERIFIED" : "UNAVAILABLE",
        humanTriggered: Boolean(raw.humanTriggered),
        status: String(raw.status || (raw.success === false ? "failed" : "completed")).slice(0, 40),
      };
      event.fingerprint = immutableUsageFingerprint(event);
      const result = await engine.store.insertUsage(event);
      if (result === "duplicate") duplicates += 1;
      else if (result === "conflict") {
        conflicts += 1;
        rejected += 1;
        errors.push("idempotency_conflict");
      } else accepted += 1;
    } catch (err) {
      rejected += 1;
      errors.push(err instanceof Error ? err.message : "invalid_event");
    }
  }

  await evaluateAlerts(engine);
  return { accepted, duplicates, conflicts, rejected, errors: [...new Set(errors)] };
}

export async function evaluateAlerts(engine: AiCostEngine): Promise<CostAlert[]> {
  const now = engine.now();
  const summary = await buildExecutiveSummary(engine);
  const usage = await engine.store.listUsage();
  const budgets = await engine.store.listBudgets();
  const month = chicagoMonthBounds(now);
  const day = chicagoDayBounds(now);

  async function raise(type: string, severity: CostAlert["severity"], message: string, scope: string) {
    const window = Math.floor(now.getTime() / AI_COST_ALERT_DEDUP_WINDOW_MS);
    return engine.store.upsertAlert({
      type,
      severity,
      message,
      dedupeKey: `${type}:${scope}:${window}`,
      now: now.toISOString(),
    });
  }

  if (summary.dataFreshness.stale) {
    await raise("stale_sync", "warning", summary.dataFreshness.label, "global");
  }
  if (summary.unattributedUsage.count > 0) {
    await raise(
      "unattributed_usage",
      "warning",
      `${summary.unattributedUsage.count} unattributed usage event(s)`,
      "global",
    );
  }

  const dailyBudget = budgets.find((b) => b.scope === "daily_metered");
  if (dailyBudget && summary.meteredToday.unknownCount === 0 && summary.meteredToday.known >= dailyBudget.amountUsd) {
    await raise("daily_metered_warning", "warning", `Metered today ${summary.meteredToday.display} ≥ budget`, "daily");
  }
  const overall = budgets.find((b) => b.scope === "overall");
  if (overall && summary.estimatedTotalThisMonth.unknownCount === 0 && summary.estimatedTotalThisMonth.known >= overall.amountUsd) {
    await raise("monthly_overall_budget", "critical", `Month total ${summary.estimatedTotalThisMonth.display} ≥ budget`, "overall");
  }

  const knownProviders = new Set<string>(KNOWN_PROVIDERS.map((p) => p.id));
  for (const ev of usage) {
    if (!knownProviders.has(ev.provider)) {
      await raise("unexpected_provider", "warning", `Unknown provider ${ev.provider}`, ev.provider);
    }
  }

  const retryStorm = usage.filter(
    (e) => e.retries >= 3 && inIso(e.occurredAt, day.start, day.end),
  );
  if (retryStorm.length >= 5) {
    await raise("retry_storm", "critical", `${retryStorm.length} high-retry events today`, "global");
  }

  const audio = usage.filter((e) => (e.audioSeconds || 0) > 0 && inIso(e.occurredAt, day.start, day.end));
  const audioFp = new Map<string, number>();
  for (const ev of audio) {
    const key = `${ev.agentId}|${ev.audioSeconds}|${ev.provider}`;
    audioFp.set(key, (audioFp.get(key) || 0) + 1);
  }
  for (const [key, count] of audioFp) {
    if (count >= 3) await raise("duplicate_transcription", "warning", `Repeated transcription ${key}`, key);
  }

  const loopAgents = new Map<string, number>();
  for (const ev of usage.filter((e) => inIso(e.occurredAt, day.start, day.end))) {
    loopAgents.set(ev.agentId, (loopAgents.get(ev.agentId) || 0) + 1);
  }
  for (const [agentId, count] of loopAgents) {
    if (count >= 80) await raise("worker_loop", "critical", `Agent ${agentId} made ${count} calls today`, agentId);
  }

  void month;
  return engine.store.listAlerts();
}

export async function upsertSubscription(
  engine: AiCostEngine,
  patch: Partial<SubscriptionRecord> & { id: string },
  actor: string,
): Promise<SubscriptionRecord> {
  const existing = (await engine.store.listSubscriptions()).find((s) => s.id === patch.id);
  const row: SubscriptionRecord = {
    id: patch.id,
    providerId: patch.providerId || existing?.providerId || "unknown",
    plan: patch.plan || existing?.plan || "UNKNOWN",
    amount: patch.amount === undefined ? existing?.amount ?? null : patch.amount,
    currency: "USD",
    cadence: patch.cadence || existing?.cadence || "unknown",
    effectiveDate: patch.effectiveDate || existing?.effectiveDate || chicagoYmd(engine.now()),
    source: patch.source || existing?.source || "USER_REPORTED",
    verificationStatus: patch.verificationStatus || existing?.verificationStatus || "USER_REPORTED",
    notes: patch.notes ?? existing?.notes ?? "",
    kind: patch.kind || existing?.kind || "fixed",
    domain: patch.domain || existing?.domain || "party_perfect",
    partyPerfectAllocationPct:
      patch.partyPerfectAllocationPct === undefined
        ? existing?.partyPerfectAllocationPct ?? 100
        : patch.partyPerfectAllocationPct,
    accountOwner: patch.accountOwner || existing?.accountOwner || "Mason",
    purpose: patch.purpose || existing?.purpose || "",
    renewalDate: patch.renewalDate === undefined ? existing?.renewalDate ?? null : patch.renewalDate,
    active: patch.active === undefined ? existing?.active ?? true : patch.active,
    inactiveDate: patch.inactiveDate === undefined ? existing?.inactiveDate ?? null : patch.inactiveDate,
    updatedAt: engine.now().toISOString(),
    updatedBy: actor,
  };
  return engine.store.upsertSubscription(row, actor);
}

export async function upsertBudget(
  engine: AiCostEngine,
  patch: Omit<BudgetRecord, "updatedAt">,
): Promise<BudgetRecord> {
  return engine.store.upsertBudget({
    ...patch,
    updatedAt: engine.now().toISOString(),
  });
}

export async function acknowledgeAlert(
  engine: AiCostEngine,
  id: string,
  actor: string,
  action: "acknowledge" | "resolve",
) {
  return engine.store.acknowledgeAlert(id, actor, action);
}

export async function exportCsv(engine: AiCostEngine): Promise<string> {
  const usage = await engine.store.listUsage();
  const header = [
    "occurred_at",
    "agent_id",
    "provider",
    "model",
    "task_id",
    "correlation_id",
    "domain",
    "input_tokens",
    "output_tokens",
    "cached_tokens",
    "audio_seconds",
    "retries",
    "estimated_cost_usd",
    "verified_cost_usd",
    "verification_status",
    "source",
    "status",
    "human_triggered",
  ];
  const lines = [header.join(",")];
  for (const e of usage) {
    lines.push(
      [
        e.occurredAt,
        e.agentId,
        e.provider,
        e.model ?? "",
        e.taskId ?? "",
        e.correlationId ?? "",
        e.domain,
        e.inputTokens ?? "",
        e.outputTokens ?? "",
        e.cachedTokens ?? "",
        e.audioSeconds ?? "",
        e.retries,
        e.estimatedCostUsd ?? "",
        e.verifiedCostUsd ?? "",
        e.verificationStatus,
        e.source,
        e.status,
        e.humanTriggered ? "yes" : "no",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
  }
  const text = lines.join("\n");
  if (payloadHasSecret(text)) throw new Error("csv_secret_blocked");
  return text;
}

export function publicDashboardPayload(input: {
  summary: ExecutiveSummary;
  providers: ProviderCostRow[];
  agents: AgentCostRow[];
  tasks: TaskCostRow[];
  subscriptions: SubscriptionRecord[];
  budgets: BudgetRecord[];
  alerts: CostAlert[];
  audit: AuditEntry[];
}) {
  return {
    schemaVersion: 1,
    taskId: "OWNER-AI-COST-USAGE-001",
    observesOnly: true,
    ...input,
  };
}

export function newEventId(): string {
  return randomUUID();
}
