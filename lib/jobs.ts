export const JOB_ROLES = [
  {
    id: "showroom",
    label: "Showroom",
    blurb: "Welcome guests & style the space",
    icon: "✨",
  },
  {
    id: "sales",
    label: "Sales",
    blurb: "Phones, quotes & happy clients",
    icon: "📞",
  },
  {
    id: "lines",
    label: "Lines Department",
    blurb: "Linens, polish & prep magic",
    icon: "🧵",
  },
  {
    id: "delivery",
    label: "Delivery Team",
    blurb: "Load, drive & make events happen",
    icon: "🚚",
  },
  {
    id: "tents",
    label: "Tents Crew",
    blurb: "Build structures that wow",
    icon: "⛺",
  },
  {
    id: "open",
    label: "Open to anything",
    blurb: "Put me where I shine",
    icon: "🎉",
  },
] as const;

export type JobRoleId = (typeof JOB_ROLES)[number]["id"];

/** Mike flags / texts Josh when score is at or above this. */
export const TOP_CANDIDATE_SCORE = 70;

export type EligibilityAnswer = "yes" | "no" | "";

export interface WorkHistoryEntry {
  employer: string;
  roleTitle: string;
  startDate: string;
  endDate: string;
  startPay: string;
  endPay: string;
  stillEmployed: boolean;
}

export interface JobApplicationInput {
  roles: JobRoleId[];
  fullName: string;
  phone: string;
  email: string;
  city: string;
  eligibleToWork: EligibilityAnswer;
  over18: EligibilityAnswer;
  validDriverLicense: EligibilityAnswer;
  availability: string;
  physicalAbility: string;
  whyPartyPerfect: string;
  experience: string;
  workHistory: WorkHistoryEntry[];
  videoUrl?: string;
}

export interface MikeJobReview {
  score: number;
  primaryFit: string;
  secondaryFits: string[];
  summary: string;
  flagForJosh: boolean;
  strengths: string[];
}

export interface JobApplication extends JobApplicationInput {
  id: string;
  submittedAt: string;
  source: "partyperfectjobs";
  mike: MikeJobReview;
}

export function roleLabel(id: string) {
  return JOB_ROLES.find((role) => role.id === id)?.label ?? id;
}

/** Fast heuristic when Grok is unavailable — Mike still returns a fit. */
export function heuristicMikeReview(
  input: JobApplicationInput,
): MikeJobReview {
  let score = 45;
  const strengths: string[] = [];

  if (input.roles.length > 0) {
    score += 8;
    strengths.push("Clear interest areas selected");
  }
  if (input.eligibleToWork === "yes") score += 10;
  if (input.over18 === "yes") score += 5;
  if (input.availability.trim().length > 12) {
    score += 8;
    strengths.push("Shared concrete availability");
  }
  if (input.physicalAbility.trim().length > 8) score += 6;
  if (input.whyPartyPerfect.trim().length > 24) {
    score += 12;
    strengths.push("Thoughtful “Why Party Perfect?” answer");
  }
  if (input.validDriverLicense === "yes") {
    score += 6;
    strengths.push("Valid driver’s license");
  }
  if (input.workHistory?.length) {
    score += Math.min(12, input.workHistory.length * 4);
    strengths.push("Work history with pay details");
  } else if (input.experience.trim().length > 20) {
    score += 10;
    strengths.push("Relevant experience noted");
  }
  if (input.videoUrl?.trim()) {
    score += 6;
    strengths.push("Optional video included");
  }

  score = Math.max(0, Math.min(100, score));

  const preferred = input.roles.filter((role) => role !== "open");
  const primaryFit =
    preferred[0] != null
      ? roleLabel(preferred[0])
      : input.roles.includes("open")
        ? "Open / float — Mike will place"
        : "General crew";

  const secondaryFits = preferred
    .slice(1, 3)
    .map((role) => roleLabel(role));

  return {
    score,
    primaryFit,
    secondaryFits,
    summary: `${input.fullName} applied for ${
      preferred.length
        ? preferred.map(roleLabel).join(", ")
        : "open placement"
    }. Availability: ${input.availability.slice(0, 80)}. Mike recommends starting conversations around ${primaryFit}.`,
    flagForJosh: score >= TOP_CANDIDATE_SCORE,
    strengths: strengths.length ? strengths : ["Completed a fast application"],
  };
}
