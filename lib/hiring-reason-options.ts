/** Client-safe hiring close options (no server/Redis imports). */

export type HireOutcome = "hired" | "rejected";

export const HIRE_REJECT_REASONS = [
  { id: "not_physical", label: "Not ready for physical / outdoor work" },
  { id: "schedule", label: "Schedule / availability doesn’t work" },
  { id: "no_show_vibe", label: "Reliability / attitude concern" },
  { id: "commute", label: "Too far / transportation issue" },
  { id: "experience", label: "Experience not a fit for the role" },
  { id: "role_mismatch", label: "Wanted a different position than we need" },
  { id: "hired_someone_else", label: "Filled with someone stronger" },
  { id: "duplicate", label: "Duplicate application" },
  { id: "candidate_withdrew", label: "They withdrew / stopped responding" },
  { id: "other", label: "Other (explain in notes)" },
] as const;

export const HIRE_HIRED_REASONS = [
  { id: "physical_ready", label: "Physical / outdoor ready (tents crew fit)" },
  { id: "delivery_ready", label: "Delivery ready (license + solid work)" },
  { id: "schedule_flexible", label: "Flexible schedule / shows up energy" },
  { id: "experience_fit", label: "Right experience for the role" },
  { id: "people_skills", label: "People skills (showroom / sales)" },
  { id: "local_reliable", label: "Local + reliable transport" },
  { id: "interview_strong", label: "Strong call / interview" },
  { id: "other", label: "Other (explain in notes)" },
] as const;

export type HireRejectReasonId = (typeof HIRE_REJECT_REASONS)[number]["id"];
export type HireHiredReasonId = (typeof HIRE_HIRED_REASONS)[number]["id"];

export function reasonLabelFor(outcome: HireOutcome, id: string): string {
  if (outcome === "hired") {
    return (
      HIRE_HIRED_REASONS.find((r) => r.id === id)?.label ??
      HIRE_HIRED_REASONS[HIRE_HIRED_REASONS.length - 1].label
    );
  }
  return (
    HIRE_REJECT_REASONS.find((r) => r.id === id)?.label ??
    HIRE_REJECT_REASONS[HIRE_REJECT_REASONS.length - 1].label
  );
}

export function knownReasonIds(outcome: HireOutcome): Set<string> {
  const list = outcome === "hired" ? HIRE_HIRED_REASONS : HIRE_REJECT_REASONS;
  return new Set(list.map((r) => r.id));
}
