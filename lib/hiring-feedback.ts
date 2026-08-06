import { readDurableJson, writeDurableJson } from "@/lib/durable-json";
import type { JobRoleId } from "@/lib/jobs";
import { roleLabel } from "@/lib/jobs";
import {
  knownReasonIds,
  reasonLabelFor,
  type HireOutcome,
} from "@/lib/hiring-reason-options";

export type {
  HireHiredReasonId,
  HireOutcome,
  HireRejectReasonId,
} from "@/lib/hiring-reason-options";
export {
  HIRE_HIRED_REASONS,
  HIRE_REJECT_REASONS,
  reasonLabelFor,
} from "@/lib/hiring-reason-options";

const FEEDBACK_KEY = "hiring-reject-feedback.json";
const MAX_ENTRIES = 100;

export interface HiringOutcomeFeedback {
  id: string;
  applicationId: string;
  fullName: string;
  roles: JobRoleId[];
  city?: string;
  mikeScore?: number;
  primaryFit?: string;
  /** hired | rejected — both remove the app from the queue. */
  outcome: HireOutcome;
  reasonId: string;
  reasonLabel: string;
  notes: string;
  decidedAt: string;
  /** @deprecated older redis rows */
  rejectedAt?: string;
}

/** @deprecated use HiringOutcomeFeedback */
export type HiringRejectFeedback = HiringOutcomeFeedback;

export function rejectReasonLabel(id: string): string {
  return reasonLabelFor("rejected", id);
}

export async function listHiringRejectFeedback(): Promise<
  HiringOutcomeFeedback[]
> {
  const data = await readDurableJson<HiringOutcomeFeedback[]>(FEEDBACK_KEY, []);
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    ...row,
    outcome: row.outcome === "hired" ? "hired" : "rejected",
    decidedAt: row.decidedAt || row.rejectedAt || new Date().toISOString(),
  }));
}

export async function recordHiringOutcomeFeedback(input: {
  applicationId: string;
  fullName: string;
  roles: JobRoleId[];
  city?: string;
  mikeScore?: number;
  primaryFit?: string;
  outcome: HireOutcome;
  reasonId: string;
  notes?: string;
}): Promise<HiringOutcomeFeedback> {
  const outcome: HireOutcome =
    input.outcome === "hired" ? "hired" : "rejected";
  const allowed = knownReasonIds(outcome);
  const reasonId = allowed.has(input.reasonId) ? input.reasonId : "other";
  const notes = (input.notes || "").trim();
  if (reasonId === "other" && notes.length < 3) {
    throw new Error(
      "Please type a short note (why) so Mike can learn what you look for.",
    );
  }
  if (!input.reasonId?.trim()) {
    throw new Error(
      "Pick Hired or Rejected and a reason so Mike can learn.",
    );
  }

  const entry: HiringOutcomeFeedback = {
    id: crypto.randomUUID(),
    applicationId: input.applicationId,
    fullName: input.fullName.trim(),
    roles: input.roles,
    city: input.city,
    mikeScore: input.mikeScore,
    primaryFit: input.primaryFit,
    outcome,
    reasonId,
    reasonLabel: reasonLabelFor(outcome, reasonId),
    notes,
    decidedAt: new Date().toISOString(),
  };

  const existing = await listHiringRejectFeedback();
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  await writeDurableJson(FEEDBACK_KEY, next);
  return entry;
}

/** Back-compat alias. */
export async function recordHiringRejectFeedback(input: {
  applicationId: string;
  fullName: string;
  roles: JobRoleId[];
  city?: string;
  mikeScore?: number;
  primaryFit?: string;
  reasonId: string;
  notes?: string;
  outcome?: HireOutcome;
}): Promise<HiringOutcomeFeedback> {
  return recordHiringOutcomeFeedback({
    ...input,
    outcome: input.outcome ?? "rejected",
  });
}

/** Compact learnings for Mike system / scoring prompts. */
export function formatHiringFeedbackForMike(
  entries: HiringOutcomeFeedback[],
): string {
  if (entries.length === 0) {
    return [
      "Hiring learnings: none yet.",
      "When Josh closes an application he MUST pick Hired or Rejected and WHY — never silent deletes.",
      "Use those reasons to score and filter future applicants.",
      "Always hiring for ALL positions.",
    ].join("\n");
  }

  const hired = entries.filter((e) => e.outcome === "hired");
  const rejected = entries.filter((e) => e.outcome !== "hired");

  const countLabels = (rows: HiringOutcomeFeedback[]) => {
    const counts = new Map<string, number>();
    for (const e of rows) {
      counts.set(e.reasonLabel, (counts.get(e.reasonLabel) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, n]) => `${label} (${n})`)
      .join("; ");
  };

  const line = (e: HiringOutcomeFeedback) => {
    const roles = e.roles.map(roleLabel).join("/") || "—";
    const note = e.notes ? ` — notes: ${e.notes.slice(0, 140)}` : "";
    const tag = e.outcome === "hired" ? "HIRED" : "REJECTED";
    return `• [${tag}] ${e.fullName} (score ${e.mikeScore ?? "—"}, ${roles}): ${e.reasonLabel}${note}`;
  };

  return [
    "Hiring learnings from Josh (Hired vs Rejected WHY — USE THESE for score/filter):",
    `Always hiring for ALL positions.`,
    hired.length
      ? `What we HIRE for (boost scores with these signals): ${countLabels(hired) || "—"}`
      : "What we HIRE for: no hired feedback yet.",
    rejected.length
      ? `What we REJECT for (lower scores / filter): ${countLabels(rejected) || "—"}`
      : "What we REJECT for: no reject feedback yet.",
    "Recent decisions:",
    ...entries.slice(0, 20).map(line),
  ].join("\n");
}
