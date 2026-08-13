/**
 * Deterministic AI cost arithmetic. No LLM. America/Chicago day boundaries.
 * UNKNOWN is never $0. Estimated and verified stay separate.
 */

export const AI_COST_TZ = "America/Chicago";
export const AI_COST_CURRENCY = "USD";

export type CostClass =
  | "ACTUAL"
  | "CALCULATED"
  | "ESTIMATED"
  | "FIXED_SUBSCRIPTION"
  | "INFRASTRUCTURE"
  | "UNKNOWN";

export type VerificationStatus =
  | "USER_REPORTED"
  | "PROVIDER_VERIFIED"
  | "UNVERIFIED"
  | "UNAVAILABLE";

export const MICROS_PER_USD = BigInt(1000000);

/** Integer millionths of a USD. Avoids binary float money math. */
export function usdToMicros(amount: number | string): bigint {
  const s = typeof amount === "number" ? amount.toFixed(6) : String(amount).trim();
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const [w, f = ""] = abs.split(".");
  const frac = `${f}000000`.slice(0, 6);
  const micros = BigInt(w || "0") * MICROS_PER_USD + BigInt(frac);
  return neg ? -micros : micros;
}

export function microsToUsdNumber(micros: bigint): number {
  const neg = micros < BigInt(0);
  const abs = neg ? -micros : micros;
  const whole = abs / MICROS_PER_USD;
  const frac = abs % MICROS_PER_USD;
  const n = Number(whole) + Number(frac) / 1e6;
  return neg ? -n : n;
}

export type MoneyBucket = {
  knownMicros: bigint;
  unknownCount: number;
  knownCount: number;
};

export function moneyBucket(): MoneyBucket {
  return { knownMicros: BigInt(0), unknownCount: 0, knownCount: 0 };
}

export function addKnown(bucket: MoneyBucket, amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(amount)) {
    bucket.unknownCount += 1;
    return;
  }
  bucket.knownMicros += usdToMicros(amount);
  bucket.knownCount += 1;
}

export function bucketKnownUsd(bucket: MoneyBucket): number {
  return microsToUsdNumber(bucket.knownMicros);
}

export function roundUsd6(n: number): number {
  return microsToUsdNumber(usdToMicros(n));
}

export function displayMoney(bucket: MoneyBucket, digits = 2): string {
  const known = Number(bucketKnownUsd(bucket).toFixed(digits));
  if (bucket.knownCount === 0 && bucket.unknownCount === 0) return `$${known.toFixed(digits)}`;
  if (bucket.knownCount === 0) {
    return `UNKNOWN (${bucket.unknownCount} ${bucket.unknownCount === 1 ? "item" : "items"})`;
  }
  if (bucket.unknownCount > 0) {
    return `$${known.toFixed(digits)} + ${bucket.unknownCount} UNKNOWN`;
  }
  return `$${known.toFixed(digits)}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function chicagoYmd(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: AI_COST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

export function chicagoMonthKey(d: Date): string {
  return chicagoYmd(d).slice(0, 7);
}

function chicagoLocalStamp(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: AI_COST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** UTC instant for a civil datetime in America/Chicago. */
export function chicagoLocalToUtc(
  y: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const desired = `${y}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  let utc = Date.parse(`${desired}Z`);
  for (let i = 0; i < 8; i++) {
    const shown = chicagoLocalStamp(new Date(utc));
    const diff = Date.parse(`${desired}Z`) - Date.parse(`${shown}Z`);
    utc += diff;
    if (diff === 0) break;
  }
  return new Date(utc);
}

export function chicagoDayBounds(d: Date): { start: Date; end: Date; ymd: string } {
  const ymd = chicagoYmd(d);
  const [y, m, day] = ymd.split("-").map(Number);
  const start = chicagoLocalToUtc(y, m, day, 0, 0, 0);
  const next = new Date(start.getTime() + 36 * 3600 * 1000);
  const nextYmd = chicagoYmd(next);
  const [ny, nm, nd] = nextYmd.split("-").map(Number);
  const end = chicagoLocalToUtc(ny, nm, nd, 0, 0, 0);
  return { start, end, ymd };
}

export function chicagoMonthBounds(d: Date): {
  start: Date;
  end: Date;
  key: string;
  dayOfMonth: number;
  daysInMonth: number;
} {
  const ymd = chicagoYmd(d);
  const [y, m, day] = ymd.split("-").map(Number);
  const start = chicagoLocalToUtc(y, m, 1, 0, 0, 0);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const end = chicagoLocalToUtc(nextY, nextM, 1, 0, 0, 0);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86400000);
  return { start, end, key: `${y}-${pad2(m)}`, dayOfMonth: day, daysInMonth };
}

export function inRange(iso: string, start: Date, end: Date): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return t >= start.getTime() && t < end.getTime();
}

export type RateRow = {
  provider: string;
  model: string;
  version: string;
  effectiveFrom: string;
  inputPer1m: number | null;
  outputPer1m: number | null;
  cachedPer1m: number | null;
  audioPerMinute?: number | null;
  imagePerUnit?: number | null;
  storagePerGb?: number | null;
  computePerHour?: number | null;
};

export function selectRate(
  rates: RateRow[],
  provider: string,
  model: string,
  occurredAt: string,
): RateRow | null {
  const t = Date.parse(occurredAt);
  if (!Number.isFinite(t)) return null;
  const candidates = rates
    .filter((r) => r.provider === provider && (r.model === model || r.model === "*"))
    .filter((r) => Date.parse(r.effectiveFrom) <= t)
    .sort((a, b) => {
      const spec = Number(a.model === model) - Number(b.model === model);
      if (spec !== 0) return spec;
      return Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom);
    });
  return candidates[0] ?? null;
}

export function calculateTokenCost(input: {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  rate: RateRow | null;
}): { amount: number | null; class: CostClass } {
  if (!input.rate) return { amount: null, class: "UNKNOWN" };
  if (
    input.rate.inputPer1m == null ||
    input.rate.outputPer1m == null
  ) {
    return { amount: null, class: "UNKNOWN" };
  }
  if (input.inputTokens == null && input.outputTokens == null) {
    return { amount: null, class: "UNKNOWN" };
  }
  const inputTokens = BigInt(input.inputTokens ?? 0);
  const outputTokens = BigInt(input.outputTokens ?? 0);
  const cached = BigInt(input.cachedTokens ?? 0);
  const billedInput = inputTokens > cached ? inputTokens - cached : BigInt(0);
  const inRate = usdToMicros(input.rate.inputPer1m);
  const outRate = usdToMicros(input.rate.outputPer1m);
  const cachedRate = usdToMicros(input.rate.cachedPer1m ?? 0);
  const micros =
    (billedInput * inRate + outputTokens * outRate + cached * cachedRate) / BigInt(1000000);
  return { amount: microsToUsdNumber(micros), class: "CALCULATED" };
}

export function monthlyEquivalent(input: {
  amount: number | null;
  cadence: string;
}): number | null {
  if (input.amount == null || !Number.isFinite(input.amount)) return null;
  const micros = usdToMicros(input.amount);
  if (input.cadence === "yearly") return microsToUsdNumber(micros / BigInt(12));
  if (input.cadence === "weekly") return microsToUsdNumber((micros * BigInt(52)) / BigInt(12));
  if (input.cadence === "monthly") return microsToUsdNumber(micros);
  return null;
}

/** Prorate a monthly-equivalent across days active in the Chicago month. */
export function prorateFixedForMonth(input: {
  amount: number | null;
  cadence: string;
  effectiveDate: string;
  active: boolean;
  inactiveDate?: string | null;
  monthStart: Date;
  monthEnd: Date;
}): number | null {
  if (!input.active) return 0;
  const monthly = monthlyEquivalent({ amount: input.amount, cadence: input.cadence });
  if (monthly == null) return null;
  const eff = Date.parse(`${input.effectiveDate}T00:00:00.000Z`);
  if (!Number.isFinite(eff) || eff >= input.monthEnd.getTime()) return 0;
  const inactive = input.inactiveDate ? Date.parse(input.inactiveDate) : null;
  if (inactive != null && inactive < input.monthStart.getTime()) return 0;
  const start = Math.max(eff, input.monthStart.getTime());
  const end = inactive != null && inactive < input.monthEnd.getTime() ? inactive : input.monthEnd.getTime();
  const daysInMonth = Math.max(1, Math.round((input.monthEnd.getTime() - input.monthStart.getTime()) / 86400000));
  const daysActive = Math.max(0, Math.round((end - start) / 86400000));
  if (daysActive >= daysInMonth) return monthly;
  return microsToUsdNumber((usdToMicros(monthly) * BigInt(daysActive)) / BigInt(daysInMonth));
}

export function projectMonthEnd(input: {
  monthToDateKnown: number;
  knownCount: number;
  unknownCount: number;
  dayOfMonth: number;
  daysInMonth: number;
}): {
  value: number | null;
  basis: string;
  confidence: "none" | "low" | "medium";
  display: string;
} {
  if (input.knownCount === 0 || input.dayOfMonth <= 0) {
    return {
      value: null,
      basis: "no known metered spend this month",
      confidence: "none",
      display: "UNKNOWN",
    };
  }
  const value = microsToUsdNumber(
    (usdToMicros(input.monthToDateKnown) * BigInt(input.daysInMonth)) /
      BigInt(input.dayOfMonth),
  );
  return {
    value,
    basis: `known metered only; ${input.unknownCount} UNKNOWN excluded`,
    confidence: input.unknownCount === 0 ? "medium" : "low",
    display: `$${value.toFixed(2)}`,
  };
}

export function momChange(current: number | null, previous: number | null): string {
  if (current == null || previous == null) return "UNKNOWN";
  const delta = current - previous;
  const sign = delta > 0 ? "+" : "";
  return `${sign}$${delta.toFixed(2)}`;
}

export function isFutureDated(iso: string, nowMs = Date.now(), skewMs = 5 * 60 * 1000): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  return t > nowMs + skewMs;
}

export const SECRETISH_RE =
  /(sk-[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|postgres(ql)?:\/\/[^\s"']+:[^\s"']+@|Bearer\s+[A-Za-z0-9._-]{24,}|SUPABASE_SERVICE_ROLE_KEY\s*=|OWNER_PIN\s*=)/i;

export function payloadHasSecret(value: unknown): boolean {
  return SECRETISH_RE.test(JSON.stringify(value));
}

export function immutableUsageFingerprint(input: {
  occurredAt: string;
  agentId: string;
  provider: string;
  model: string | null;
  operation: string;
  inputTokens: number | null;
  outputTokens: number | null;
  domain: string;
  estimatedCostUsd: number | null;
  usageKind?: string | null;
}): string {
  return [
    input.occurredAt,
    input.agentId,
    input.provider,
    input.model ?? "",
    input.operation,
    input.inputTokens ?? "",
    input.outputTokens ?? "",
    input.domain,
    input.estimatedCostUsd ?? "",
    input.usageKind ?? "",
  ].join("|");
}

/** Neutralize CSV formula injection while remaining parseable. */
export function csvEscape(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
