export type TimePeriod = "7d" | "30d" | "3m" | "all";

export const DEFAULT_TIME_PERIOD: TimePeriod = "30d";

export const TIME_PERIOD_OPTIONS: {
  id: TimePeriod;
  label: string;
  shortLabel: string;
}[] = [
  { id: "7d", label: "Last 7 Days", shortLabel: "7 days" },
  { id: "30d", label: "Last 30 Days", shortLabel: "30 days" },
  { id: "3m", label: "Last 3 Months", shortLabel: "3 months" },
  { id: "all", label: "All Time", shortLabel: "all time" },
];

export function getTimePeriodLabel(period: TimePeriod) {
  return TIME_PERIOD_OPTIONS.find((option) => option.id === period)?.label ?? "Last 30 Days";
}

export function getTimePeriodCutoff(period: TimePeriod): number | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export function isWithinTimePeriod(isoDate: string, period: TimePeriod) {
  const cutoff = getTimePeriodCutoff(period);
  if (cutoff === null) return true;
  return new Date(isoDate).getTime() >= cutoff;
}
