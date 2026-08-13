import { applyHiringSelectionWeights } from "./hiring-selection-playbook";

export type AutoFilterResult = {
  park: boolean;
  scoreCap: number;
  reasons: string[];
};

/** Crew-track roles that require transport + outdoor physical OK. */
export function wantsCrewTrack(roles: string[]): boolean {
  return roles.some((role) =>
    [
      "tents",
      "warehouse",
      "delivery",
      "linen",
      "dish",
      "deco",
      "open",
      // Legacy ids still on older applications
      "lines",
    ].includes(role),
  );
}

/**
 * Explicit auto-filter rules (playbook → code).
 * Caps score and parks — does not delete the application.
 */
export function evaluateAutoFilters(input: {
  roles: string[];
  eligibleToWork?: string;
  over18?: string;
  physicalOutdoorOk?: string;
  hasReliableTransport?: string;
  validDriverLicense?: string;
  availabilitySlots?: string[];
  daysMissedLast3Months?: string;
}): AutoFilterResult {
  const reasons: string[] = [];
  let park = false;
  let scoreCap = 100;
  const crew = wantsCrewTrack(input.roles);

  if (input.eligibleToWork === "no" || input.over18 === "no") {
    park = true;
    scoreCap = Math.min(scoreCap, 20);
    reasons.push("Hard gate: 18+ / work eligibility");
  }

  if (crew && input.physicalOutdoorOk === "no") {
    park = true;
    scoreCap = Math.min(scoreCap, 35);
    reasons.push("Crew role + not OK with outdoor heat / 50+ lb lifting");
  }

  if (crew && input.hasReliableTransport === "no") {
    park = true;
    scoreCap = Math.min(scoreCap, 38);
    reasons.push("Crew role + no reliable transport to warehouse");
  }

  if (
    input.roles.includes("delivery") &&
    input.validDriverLicense === "no" &&
    !input.roles.some((r) =>
      ["tents", "warehouse", "linen", "dish", "deco", "lines", "showroom"].includes(
        r,
      ),
    )
  ) {
    scoreCap = Math.min(scoreCap, 48);
    reasons.push("Delivery-only without license");
  }

  const slots = input.availabilitySlots || [];
  if (
    crew &&
    slots.length > 0 &&
    !slots.includes("weekday_am") &&
    !slots.includes("early_am") &&
    slots.every((s) => s === "weekends")
  ) {
    scoreCap = Math.min(scoreCap, 50);
    reasons.push("Weekends-only availability for crew volume");
  }

  if (input.daysMissedLast3Months === "3+") {
    scoreCap = Math.min(scoreCap, 55);
    reasons.push("High recent absences (3+ days missed)");
  }

  return { park, scoreCap, reasons };
}

export const JOB_ROLES = [
  {
    id: "tents",
    label: "Tents & Setup",
    blurb: "Hot outdoor builds — tents, stakes, grit",
    icon: "⛺",
  },
  {
    id: "warehouse",
    label: "Warehouse",
    blurb: "Pace, pull, prep, and keep the dock moving",
    icon: "📦",
  },
  {
    id: "delivery",
    label: "Delivery/Driver",
    blurb: "Load, drive, and make events happen",
    icon: "🚚",
  },
  {
    id: "linen",
    label: "Linen",
    blurb: "Linens, polish, and prep magic",
    icon: "🧵",
  },
  {
    id: "dish",
    label: "Dish",
    blurb: "China, glass, and dish-room hustle",
    icon: "🍽️",
  },
  {
    id: "deco",
    label: "Décor",
    blurb: "Style rooms and event looks with the deco team",
    icon: "✨",
  },
  {
    id: "leadership",
    label: "Leadership",
    blurb: "Lead crews and grow into management",
    icon: "⭐",
  },
  {
    id: "open",
    label: "Not sure",
    blurb: "Put me where I shine",
    icon: "🎉",
  },
] as const;

export type JobRoleId = (typeof JOB_ROLES)[number]["id"];

/** Older applications may still carry these role ids. */
const LEGACY_ROLE_LABELS: Record<string, string> = {
  showroom: "Showroom",
  sales: "Sales",
  lines: "Linen",
};

/** Mike flags / texts Josh when score is at or above this. */
export const TOP_CANDIDATE_SCORE = 70;

export type EligibilityAnswer = "yes" | "no" | "";

export type CollegeStatus =
  | ""
  | "none"
  | "some"
  | "graduated"
  | "in_progress";

/** Structured availability windows (filterable + scored). */
export type AvailabilitySlot = "weekday_am" | "weekends" | "early_am";

export type DaysMissedBucket = "" | "0" | "1-2" | "3+";

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

export type JobApplyMode = "quick" | "full" | "enrich";

export interface JobApplicationInput {
  roles: JobRoleId[];
  fullName: string;
  phone: string;
  email: string;
  city: string;
  /** quick = legacy stored rows only (removed from product 2026-08-13); enrich = CC follow-up on old quick rows; full = complete application */
  applyMode?: JobApplyMode;
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
  /** Reliable transport to 8401 E 41st St */
  hasReliableTransport: EligibilityAnswer;
  /** Outdoor heat + lifting 50+ lbs OK */
  physicalOutdoorOk: EligibilityAnswer;
  earliestStartDate: string;
  daysMissedLast3Months: DaysMissedBucket;
  availabilitySlots: AvailabilitySlot[];
  /** Derived / free-text availability (kept for Mike + legacy) */
  availability: string;
  physicalAbility: string;
  /** Signal-rich: physical / fast-paced work story */
  physicalStory: string;
  whyPartyPerfect: string;
  experience: string;
  workHistory: WorkHistoryEntry[];
  videoUrl?: string;
  /** Extracted resume text for Mike (not shown to applicant) */
  resumeText?: string;
  /** Resume file metadata after upload (optional) */
  resumeFileName?: string;
  resumeMimeType?: string;
  resumeBlobPathname?: string;
  /** Inline data URI fallback when Blob is not configured (small files only) */
  resumeDataUrl?: string;
  /**
   * Marketing channel from ?src= on partyperfectjobs.com
   * (indeed, facebook, truck-qr, referral, google, craigslist, tiktok, college, …).
   * Defaults to "direct". Replaces the old fixed "partyperfectjobs" marker for new apps.
   */
  source?: string;
}

export interface MikeJobReview {
  score: number;
  primaryFit: string;
  secondaryFits: string[];
  summary: string;
  flagForJosh: boolean;
  strengths: string[];
  /** Who produced the score — only grok 70+ may SMS-flag owners. */
  scoredBy: "grok" | "heuristic";
}

export interface JobApplication extends JobApplicationInput {
  id: string;
  submittedAt: string;
  /** Lead channel — always set on save (see normalizeJobLeadSource). */
  source: string;
  mike: MikeJobReview;
}

export function roleLabel(id: string) {
  return (
    JOB_ROLES.find((role) => role.id === id)?.label ||
    LEGACY_ROLE_LABELS[id] ||
    id
  );
}

export function referralSourceLabel(id: string) {
  if (!id) return "—";
  return JOB_REFERRAL_SOURCES.find((row) => row.id === id)?.label ?? id;
}

/** Fast heuristic when Grok is unavailable — SIGNAL points, not text-length fluff. */
export function heuristicMikeReview(
  input: JobApplicationInput,
): MikeJobReview {
  let score = 45;
  const strengths: string[] = [];

  if (input.eligibleToWork === "yes") score += 6;
  if (input.over18 === "yes") score += 4;

  if (input.hasReliableTransport === "yes") {
    score += 8;
    strengths.push("Reliable transport to warehouse");
  } else if (input.hasReliableTransport === "no") {
    score -= 10;
  }

  if (input.physicalOutdoorOk === "yes") {
    score += 10;
    strengths.push("OK with outdoor heat / 50+ lb lifting");
  } else if (input.physicalOutdoorOk === "no") {
    score -= 12;
  }

  const slots = input.availabilitySlots || [];
  if (slots.includes("weekday_am") || slots.includes("early_am")) {
    score += 7;
    strengths.push("Weekday / early availability");
  }
  if (slots.includes("weekends")) score += 3;
  if (slots.length === 0 && input.availability.trim().length > 12) score += 3;

  if (input.daysMissedLast3Months === "0") {
    score += 6;
    strengths.push("Strong recent attendance");
  } else if (input.daysMissedLast3Months === "1-2") {
    score += 2;
  } else if (input.daysMissedLast3Months === "3+") {
    score -= 8;
  }

  if (input.earliestStartDate?.trim()) score += 3;

  // License only boosts delivery/crew track
  const wantsDelivery =
    input.roles.includes("delivery") || input.roles.includes("open");
  if (input.validDriverLicense === "yes" && wantsDelivery) {
    score += 8;
    strengths.push("Valid driver’s license (delivery path)");
  } else if (input.validDriverLicense === "yes") {
    score += 3;
  }

  // Work history tenure / completeness (not raw count fluff)
  if (input.workHistory?.length) {
    let tenureHits = 0;
    for (const w of input.workHistory) {
      if (w.employer && w.startDate && w.startPay) tenureHits += 1;
      if (w.stillEmployed || (w.endDate && w.endPay)) tenureHits += 0.5;
    }
    score += Math.min(12, Math.round(tenureHits * 3));
    strengths.push("Work history with pay details");
  }

  // Physical story quality = keyword/signal, not pure length
  const story = `${input.physicalStory || ""} ${input.experience || ""} ${input.physicalAbility || ""}`;
  if (
    /\b(lift|warehouse|outdoor|tent|delivery|construct|labor|farm|dock|moving|kitchen|pace)\b/i.test(
      story,
    )
  ) {
    score += 8;
    strengths.push("Physical / pace work signals");
  } else if ((input.physicalStory || "").trim().length >= 40) {
    score += 3;
  }

  if (input.whyPartyPerfect.trim().length >= 40) {
    score += 4;
    strengths.push("Clear “Why Party Perfect?”");
  }

  if (input.videoUrl?.trim()) score += 3;
  if (input.resumeText?.trim() || input.resumeFileName) score += 3;

  if (input.highSchoolGraduated === "yes") score += 2;
  if (input.referralSource === "friend" && input.referralName?.trim()) {
    score += 4;
    strengths.push(`Referred by ${input.referralName.trim()}`);
  }

  const weighted = applyHiringSelectionWeights(input, score);
  score = weighted.score;
  for (const note of weighted.notes.slice(0, 2)) {
    strengths.push(note);
  }

  // Apply auto-filter caps (transport / physical knockouts)
  const filters = evaluateAutoFilters(input);
  if (filters.reasons.length) {
    score = Math.min(score, filters.scoreCap);
    strengths.push(...filters.reasons.slice(0, 2));
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  const preferred = input.roles.filter((role) => role !== "open");
  const physicalReady =
    input.physicalOutdoorOk === "yes" ||
    weighted.notes.some((n) => /physical|outdoor|license|flexible/i.test(n)) ||
    /\b(lift|outdoor|heavy|warehouse|tent)\b/i.test(story);

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

  if (
    physicalReady &&
    (input.roles.includes("open") || input.roles.includes("tents")) &&
    preferred[0] !== "delivery"
  ) {
    if (input.roles.includes("tents") || input.roles.includes("open")) {
      if (primaryFit === "Open / float — confirm physical path on call") {
        primaryFit = "Tents Crew";
      }
    }
  }

  const secondaryFits = preferred.slice(1, 3).map((role) => roleLabel(role));
  if (
    physicalReady &&
    primaryFit === "Tents Crew" &&
    !secondaryFits.includes("Delivery Team") &&
    input.validDriverLicense === "yes"
  ) {
    secondaryFits.unshift("Delivery Team");
  }

  const parked = filters.park;
  return {
    score,
    primaryFit,
    secondaryFits: secondaryFits.slice(0, 3),
    summary: `${input.fullName} applied for ${
      preferred.length
        ? preferred.map(roleLabel).join(", ")
        : "open placement"
    }. ${
      parked
        ? `Parked — ${filters.reasons[0] || "auto-filter"}.`
        : score >= 55
          ? `Review in Hiring for ${primaryFit}.`
          : `Weak / incomplete for current crew need.`
    }`,
    // Heuristic must NEVER page owners — only Grok 70+ may flag.
    flagForJosh: false,
    scoredBy: "heuristic",
    strengths: strengths.length
      ? strengths.slice(0, 4)
      : ["Completed application (heuristic score)"],
  };
}
