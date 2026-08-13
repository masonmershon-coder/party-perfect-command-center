import {
  wantsCrewTrack,
  type AvailabilitySlot,
  type EligibilityAnswer,
  type JobApplication,
  type JobApplicationInput,
} from "@/lib/jobs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE_LOOKBACK_DAYS = 30;

export const WHY_MIN = 40;
export const AVAIL_TEXT_MIN = 15;
export const PHYSICAL_STORY_MIN = 25;

export function normalizePhoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d;
}

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidUsPhone(phone: string): boolean {
  const d = normalizePhoneDigits(phone);
  return d.length === 10;
}

export function isValidEmail(email: string): boolean {
  const e = normalizeEmailKey(email);
  return e.length >= 5 && EMAIL_RE.test(e) && !e.includes("..");
}

export function sanitizeVideoUrl(raw: string | undefined): string | undefined {
  const v = (raw || "").trim();
  if (!v) return undefined;
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.toString().slice(0, 400);
  } catch {
    return undefined;
  }
}

export function availabilityLabelFromSlots(slots: AvailabilitySlot[]): string {
  const labels: Record<AvailabilitySlot, string> = {
    weekday_am: "weekday mornings",
    weekends: "weekends",
    early_am: "early mornings",
  };
  if (!slots.length) return "";
  return slots.map((s) => labels[s]).join(", ");
}

export function findRecentDuplicate(
  apps: JobApplication[],
  phone: string,
  email: string,
  withinDays = DUPLICATE_LOOKBACK_DAYS,
): JobApplication | null {
  const phoneKey = normalizePhoneDigits(phone);
  const emailKey = normalizeEmailKey(email);
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;

  for (const app of apps) {
    const at = Date.parse(app.submittedAt);
    if (!Number.isFinite(at) || at < cutoff) continue;
    const samePhone =
      phoneKey.length >= 10 &&
      normalizePhoneDigits(app.phone) === phoneKey;
    const sameEmail =
      emailKey && normalizeEmailKey(app.email) === emailKey;
    if (samePhone || sameEmail) return app;
  }
  return null;
}

export function validateJobApplicationInput(
  input: JobApplicationInput,
  options?: { mode?: "quick" | "full" | "enrich" },
): string | null {
  const mode = options?.mode || input.applyMode || "full";

  if (!input.fullName?.trim()) return "First name is required.";
  if (!isValidUsPhone(input.phone)) {
    return "Enter a valid 10-digit U.S. phone number.";
  }
  if (!(input.city || "").trim()) return "City is required.";
  if (!input.roles?.length) {
    return "Pick at least one role you’re interested in.";
  }

  const email = (input.email || "").trim();
  if (email && !isValidEmail(email)) {
    return "Enter a valid email address (or leave it blank).";
  }

  if (
    input.physicalOutdoorOk &&
    input.physicalOutdoorOk !== "yes" &&
    input.physicalOutdoorOk !== "no"
  ) {
    return "Are you OK with outdoor heat and lifting ~50 lbs?";
  }

  // Quick Apply removed — full application only. Do not reintroduce.
  if (mode === "quick") {
    return "Please complete the full application (Quick Apply is no longer available).";
  }

  // Enrich: validate optional sections only when the applicant filled them in.
  // Kept for existing stored Quick Apply rows in Command Center — not a public path.
  if (mode === "enrich") {
    if (email && !isValidEmail(email)) {
      return "Enter a valid email address (or leave it blank).";
    }
    const why = (input.whyPartyPerfect || "").trim();
    if (why && why.length < WHY_MIN) {
      return `Why Party Perfect needs at least ${WHY_MIN} characters (or clear it).`;
    }
    const story = (input.physicalStory || "").trim();
    if (story && story.length < PHYSICAL_STORY_MIN) {
      return "Physical/fast-paced story needs a few more sentences (or clear it).";
    }
    const history = input.workHistory || [];
    const started = history.filter(
      (e) => e.employer || e.roleTitle || e.startDate || e.startPay,
    );
    const incompleteHistory = started.find(
      (entry) =>
        !entry.employer ||
        !entry.startDate ||
        !entry.startPay ||
        (!entry.stillEmployed && (!entry.endDate || !entry.endPay)) ||
        (entry.stillEmployed && !entry.endPay),
    );
    if (incompleteHistory) {
      return "Finish each job you started (employer, dates, pay) — or remove the blank ones.";
    }
    return null;
  }

  // Full application (pre-Quick-Apply / f455daa contract)
  if (!isValidEmail(input.email)) {
    return "Enter a valid email address.";
  }
  if (input.eligibleToWork !== "yes" || input.over18 !== "yes") {
    return "Applicants must be 18+ and eligible to work in the U.S. to continue.";
  }
  if (input.validDriverLicense !== "yes" && input.validDriverLicense !== "no") {
    return "Please answer whether you have a valid driver’s license.";
  }
  if (
    input.highSchoolGraduated !== "yes" &&
    input.highSchoolGraduated !== "no"
  ) {
    return "Please answer high school / GED.";
  }
  if (!input.collegeStatus) {
    return "Please pick a college option (No college is fine).";
  }
  if (!input.referralSource) {
    return "Quick tap — how’d you hear about us?";
  }
  if (
    input.referralSource === "friend" &&
    !(input.referralName || "").trim()
  ) {
    return "Who referred you? First name is perfect.";
  }
  if (
    input.hasReliableTransport !== "yes" &&
    input.hasReliableTransport !== "no"
  ) {
    return "Do you have reliable transportation to 8401 E 41st St, Tulsa?";
  }
  if (
    input.physicalOutdoorOk !== "yes" &&
    input.physicalOutdoorOk !== "no"
  ) {
    return "Are you OK with outdoor heat and lifting 50+ lbs for tents/delivery?";
  }
  if (!(input.earliestStartDate || "").trim()) {
    return "What’s your earliest start date?";
  }
  if (!(input.daysMissedLast3Months || "").trim()) {
    return "About how many days of work did you miss in the last 3 months?";
  }
  const slots = input.availabilitySlots || [];
  const availText = (input.availability || "").trim();
  if (slots.length === 0 && availText.length < AVAIL_TEXT_MIN) {
    return "Pick at least one availability window (weekday AM / weekends / early AM).";
  }
  if ((input.whyPartyPerfect || "").trim().length < WHY_MIN) {
    return `Tell us why Party Perfect (at least ${WHY_MIN} characters).`;
  }
  if ((input.physicalStory || "").trim().length < PHYSICAL_STORY_MIN) {
    return "Describe a time you did physical or fast-paced work (a few sentences).";
  }
  if (!(input.physicalAbility || "").trim()) {
    return "Please complete the physical ability note.";
  }

  const incompleteHistory = input.workHistory.find(
    (entry) =>
      !entry.employer ||
      !entry.startDate ||
      !entry.startPay ||
      (!entry.stillEmployed && (!entry.endDate || !entry.endPay)) ||
      (entry.stillEmployed && !entry.endPay),
  );
  if (!input.workHistory.length || incompleteHistory) {
    return "Add at least one job from the last 3 years with employer, dates, and start/end pay.";
  }

  return null;
}

export function asYesNo(value: unknown): EligibilityAnswer {
  return value === "yes" || value === "no" ? value : "";
}

export function cleanAvailabilitySlots(value: unknown): AvailabilitySlot[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<AvailabilitySlot>([
    "weekday_am",
    "weekends",
    "early_am",
  ]);
  return value
    .map(String)
    .filter((s): s is AvailabilitySlot => allowed.has(s as AvailabilitySlot));
}

export { wantsCrewTrack };
