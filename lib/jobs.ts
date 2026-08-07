import { applyHiringSelectionWeights } from "./hiring-selection-playbook";

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

export type CollegeStatus =
  | ""
  | "none"
  | "some"
  | "graduated"
  | "in_progress";

/** How applicants heard about Party Perfect — one-tap on the jobs form. */
export const JOB_REFERRAL_SOURCES = [
  { id: "friend", label: "Friend / coworker" },
  { id: "indeed", label: "Indeed" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "craigslist", label: "Craigslist" },
  { id: "walkin", label: "Walk-in / saw us" },
  { id: "other", label: "Other" },
] as const;

export type JobReferralSourceId = (typeof JOB_REFERRAL_SOURCES)[number]["id"] | "";

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
  /** Graduated high school / GED */
  highSchoolGraduated: EligibilityAnswer;
  /** none | some college | graduated | currently attending */
  collegeStatus: CollegeStatus;
  /** Optional school name / notes */
  schoolingNotes?: string;
  /** One-tap: how they heard about us */
  referralSource: JobReferralSourceId;
  /** Who referred them (when source is friend/coworker) */
  referralName?: string;
  availability: string;
  physicalAbility: string;
  whyPartyPerfect: string;
  experience: string;
  workHistory: WorkHistoryEntry[];
  videoUrl?: string;
  /** Resume file metadata after upload (optional) */
  resumeFileName?: string;
  resumeMimeType?: string;
  resumeBlobPathname?: string;
  /** Inline data URI fallback when Blob is not configured (small files only) */
  resumeDataUrl?: string;
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

export function referralSourceLabel(id: string) {
  if (!id) return "—";
  return JOB_REFERRAL_SOURCES.find((row) => row.id === id)?.label ?? id;
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
  if (input.resumeFileName || input.resumeBlobPathname || input.resumeDataUrl) {
    score += 5;
    strengths.push("Resume attached");
  }
  if (input.highSchoolGraduated === "yes") {
    score += 3;
  }
  if (input.referralSource === "friend" && input.referralName?.trim()) {
    score += 4;
    strengths.push(`Referred by ${input.referralName.trim()}`);
  } else if (input.referralSource) {
    score += 1;
  }
  if (
    input.collegeStatus === "graduated" ||
    input.collegeStatus === "in_progress" ||
    input.collegeStatus === "some"
  ) {
    score += 3;
    strengths.push("College experience noted");
  }

  const weighted = applyHiringSelectionWeights(input, score);
  score = weighted.score;
  for (const note of weighted.notes.slice(0, 2)) {
    strengths.push(note);
  }

  const preferred = input.roles.filter((role) => role !== "open");
  const physicalReady =
    weighted.notes.some((n) => /physical|outdoor|license|flexible/i.test(n)) ||
    /\b(lift|outdoor|heavy|warehouse|tent)\b/i.test(
      `${input.physicalAbility} ${input.experience}`,
    );

  let primaryFit: string;
  if (preferred[0] != null) {
    primaryFit = roleLabel(preferred[0]);
  } else if (input.roles.includes("open") && physicalReady) {
    primaryFit = "Tents Crew";
  } else if (input.roles.includes("open")) {
    primaryFit = "Open / float — confirm physical path on call";
  } else {
    primaryFit = "General crew";
  }

  // Prefer tents/delivery label when they picked open or only soft front-of-house
  // but selection weights found strong crew signals.
  if (
    physicalReady &&
    (input.roles.includes("open") || input.roles.includes("tents")) &&
    preferred[0] !== "delivery"
  ) {
    if (!preferred.includes("tents") && preferred[0] === "showroom") {
      // keep showroom if only shop pick - don't force
    } else if (input.roles.includes("tents") || input.roles.includes("open")) {
      if (primaryFit === "Open / float — confirm physical path on call") {
        primaryFit = "Tents Crew";
      }
    }
  }

  const secondaryFits = preferred
    .slice(1, 3)
    .map((role) => roleLabel(role));

  if (
    physicalReady &&
    primaryFit === "Tents Crew" &&
    !secondaryFits.includes("Delivery Team") &&
    input.validDriverLicense === "yes"
  ) {
    secondaryFits.unshift("Delivery Team");
  }

  return {
    score,
    primaryFit,
    secondaryFits: secondaryFits.slice(0, 3),
    summary: `${input.fullName} applied for ${
      preferred.length
        ? preferred.map(roleLabel).join(", ")
        : "open placement"
    }. Availability: ${input.availability.slice(0, 80)}. ${
      score >= TOP_CANDIDATE_SCORE
        ? `Call-today for ${primaryFit} (tents/delivery priority).`
        : score >= 55
          ? `Review in Hiring — second-tier for current crew need.`
          : `Weak for current tents/delivery push — park or front-of-house later.`
    }`,
    flagForJosh: score >= TOP_CANDIDATE_SCORE,
    strengths: strengths.length ? strengths.slice(0, 4) : ["Completed a fast application"],
  };
}
