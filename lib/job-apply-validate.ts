import {
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

  // Quick Apply removed — full application only.
  if (mode === "quick") {
    return "Please complete the full application (Quick Apply is no longer available).";
  }

  // Hard-required: name, phone, email only. Everything else is encouraged, not blocking.
  if (!input.fullName?.trim()) return "Full name is required.";
  if (!isValidUsPhone(input.phone)) {
    return "Enter a valid 10-digit U.S. phone number.";
  }
  if (!isValidEmail(input.email)) {
    return "Enter a valid email address.";
  }

  if (!input.roles?.length) {
    return "Pick at least one role you’re interested in.";
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
