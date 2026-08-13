import {
  availabilityLabelFromSlots,
  cleanAvailabilitySlots,
  sanitizeVideoUrl,
} from "@/lib/job-apply-validate";
import { normalizeJobLeadSource } from "@/lib/job-lead-sources";
import {
  JOB_REFERRAL_SOURCES,
  JOB_ROLES,
  type CollegeStatus,
  type DaysMissedBucket,
  type JobApplicationInput,
  type JobReferralSourceId,
  type JobRoleId,
  type WorkHistoryEntry,
} from "@/lib/jobs";

export type ApplyBody = Partial<JobApplicationInput> & {
  company_website?: string;
  applicationId?: string;
  applyMode?: string;
};

const ROLE_IDS = new Set(JOB_ROLES.map((role) => role.id));
const COLLEGE = new Set<CollegeStatus>([
  "none",
  "some",
  "graduated",
  "in_progress",
]);
const REFERRALS = new Set<string>(JOB_REFERRAL_SOURCES.map((row) => row.id));

export function cleanText(value: unknown, max = 800) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

export function cleanYesNo(value: unknown): "yes" | "no" | "" {
  return value === "yes" || value === "no" ? value : "";
}

export function cleanCollege(value: unknown): CollegeStatus {
  const v = String(value ?? "").trim() as CollegeStatus;
  return COLLEGE.has(v) ? v : "";
}

export function cleanReferralSource(value: unknown): JobReferralSourceId {
  const v = String(value ?? "").trim();
  return REFERRALS.has(v) ? (v as JobReferralSourceId) : "";
}

export function cleanWorkHistory(value: unknown): WorkHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 3)
    .map((entry) => {
      const row = (entry ?? {}) as Partial<WorkHistoryEntry>;
      return {
        employer: cleanText(row.employer, 120),
        roleTitle: cleanText(row.roleTitle, 120),
        startDate: cleanText(row.startDate, 40),
        endDate: cleanText(row.endDate, 40),
        startPay: cleanText(row.startPay, 40),
        endPay: cleanText(row.endPay, 40),
        stillEmployed: Boolean(row.stillEmployed),
      };
    })
    .filter((entry) => entry.employer || entry.roleTitle || entry.startPay);
}

export function parseBodyRoles(raw: unknown): JobRoleId[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(String)
    .filter((role): role is JobRoleId => ROLE_IDS.has(role as JobRoleId));
}

export function resolveApplyMode(body: ApplyBody): {
  applyMode: "full" | "enrich";
  enrichId: string;
  error?: string;
} {
  const enrichId = cleanText(body.applicationId, 80);
  const applyModeRaw = String(body.applyMode || "").trim();
  if (applyModeRaw === "quick") {
    return {
      applyMode: "full",
      enrichId: "",
      error:
        "Quick Apply is no longer available. Please complete the full application.",
    };
  }
  const applyMode =
    applyModeRaw === "enrich" || applyModeRaw === "full"
      ? applyModeRaw
      : enrichId
        ? "enrich"
        : "full";
  if (applyMode === "enrich" && !enrichId) {
    return {
      applyMode: "full",
      enrichId: "",
      error: "Full application required.",
    };
  }
  return { applyMode, enrichId };
}

/** Normalize a public apply payload into the stored JobApplicationInput shape. */
export function buildJobApplicationInputFromBody(
  body: ApplyBody,
  extras?: Partial<JobApplicationInput>,
): JobApplicationInput {
  const roles = parseBodyRoles(body.roles);
  const availabilitySlots = cleanAvailabilitySlots(body.availabilitySlots);
  const availability =
    availabilityLabelFromSlots(availabilitySlots) ||
    cleanText(body.availability, 400);

  const daysMissedRaw = String(body.daysMissedLast3Months || "").trim();
  const daysMissedLast3Months = (
    daysMissedRaw === "0" ||
    daysMissedRaw === "1-2" ||
    daysMissedRaw === "3+"
      ? daysMissedRaw
      : ""
  ) as DaysMissedBucket;

  const { applyMode } = resolveApplyMode(body);

  return {
    roles,
    fullName: cleanText(body.fullName, 120),
    phone: cleanText(body.phone, 40),
    email: cleanText(body.email, 160).toLowerCase(),
    city: cleanText(body.city, 80) || "Tulsa",
    applyMode,
    eligibleToWork: cleanYesNo(body.eligibleToWork),
    over18: cleanYesNo(body.over18),
    validDriverLicense: cleanYesNo(body.validDriverLicense),
    highSchoolGraduated: cleanYesNo(body.highSchoolGraduated),
    collegeStatus: cleanCollege(body.collegeStatus),
    schoolingNotes: cleanText(body.schoolingNotes, 200) || undefined,
    referralSource: cleanReferralSource(body.referralSource),
    referralName: cleanText(body.referralName, 80) || undefined,
    hasReliableTransport: cleanYesNo(body.hasReliableTransport),
    physicalOutdoorOk: cleanYesNo(body.physicalOutdoorOk),
    earliestStartDate: cleanText(body.earliestStartDate, 40),
    daysMissedLast3Months,
    availabilitySlots,
    availability,
    physicalAbility: cleanText(body.physicalAbility, 400),
    physicalStory: cleanText(body.physicalStory, 800),
    whyPartyPerfect: cleanText(body.whyPartyPerfect, 500),
    experience: cleanText(body.experience, 600),
    workHistory: cleanWorkHistory(body.workHistory),
    videoUrl: sanitizeVideoUrl(cleanText(body.videoUrl, 400) || undefined),
    source: normalizeJobLeadSource(body.source),
    ...extras,
  };
}
