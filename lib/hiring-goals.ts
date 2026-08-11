/** Daily applicant intake goal for partyperfectjobs.com (Tulsa / America/Chicago). */

/** Target apps per Tulsa calendar day (Mason: 25). */
export const HIRING_DAILY_GOAL = 25;
export const HIRING_DAILY_GOAL_MIN = HIRING_DAILY_GOAL;
export const HIRING_DAILY_GOAL_MAX = HIRING_DAILY_GOAL;
export const HIRING_TIME_ZONE = "America/Chicago";

/** Calendar date key YYYY-MM-DD in Tulsa time. */
export function tulsaDateKey(iso: string | Date = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HIRING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function countAppsOnTulsaDay(
  submittedAts: Array<string | undefined | null>,
  dayKey: string = tulsaDateKey(),
): number {
  return submittedAts.filter((at) => at && tulsaDateKey(at) === dayKey).length;
}

export type HiringGoalStatus = "empty" | "building" | "hit" | "over";

export function hiringGoalStatus(todayCount: number): HiringGoalStatus {
  if (todayCount <= 0) return "empty";
  if (todayCount < HIRING_DAILY_GOAL) return "building";
  if (todayCount === HIRING_DAILY_GOAL) return "hit";
  return "over";
}

export function hiringGoalLabel(todayCount: number): string {
  const status = hiringGoalStatus(todayCount);
  if (status === "empty") {
    return `Need ${HIRING_DAILY_GOAL} today`;
  }
  if (status === "building") {
    return `On track · aim ${HIRING_DAILY_GOAL}`;
  }
  if (status === "hit") return "Daily goal hit";
  return "Above daily goal";
}
