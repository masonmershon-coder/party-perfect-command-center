import { sendApplicationBackupEmail } from "@/lib/application-mail";
import { assertGrokConfigured, grokClient } from "@/lib/grok";
import {
  formatHiringFeedbackForMike,
  listHiringRejectFeedback,
  recordHiringRejectFeedback,
} from "@/lib/hiring-feedback";
import { HIRING_SELECTION_PLAYBOOK } from "@/lib/hiring-selection-playbook";
import { normalizeJobLeadSource } from "@/lib/job-lead-sources";
import {
  evaluateAutoFilters,
  heuristicMikeReview,
  roleLabel,
  TOP_CANDIDATE_SCORE,
  type JobApplication,
  type JobApplicationInput,
  type MikeJobReview,
} from "./jobs";
import {
  jobStoreMode,
  readJobApplicationsStore,
  removeJobApplication,
  saveJobApplication,
} from "./job-store";
import {
  getAuthorizedManagerPhones,
  getTwilioConfig,
  sendSms,
} from "./twilio";

/** Primary scoring model — same funded model as Mike/Madison chat. */
export const JOB_SCORING_MODEL = "grok-4.3" as const;

export class JobApplicationSaveError extends Error {
  readonly backupEmailed: boolean;

  constructor(message: string, backupEmailed: boolean) {
    super(message);
    this.name = "JobApplicationSaveError";
    this.backupEmailed = backupEmailed;
  }
}

function applyFiltersToReview(
  input: JobApplicationInput,
  review: MikeJobReview,
): MikeJobReview {
  const filters = evaluateAutoFilters(input);
  let score = Math.min(review.score, filters.scoreCap);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const strengths = [...review.strengths];
  for (const r of filters.reasons.slice(0, 2)) {
    if (!strengths.includes(r)) strengths.push(r);
  }
  // Only Grok-scored, non-parked, 70+ may SMS-flag.
  const flagForJosh =
    review.scoredBy === "grok" &&
    !filters.park &&
    score >= TOP_CANDIDATE_SCORE;

  return {
    ...review,
    score,
    flagForJosh,
    strengths: strengths.slice(0, 4),
    summary: filters.park
      ? `${review.summary} Parked: ${filters.reasons[0] || "auto-filter"}.`
      : review.summary,
  };
}

let lastModelHealth: { ok: boolean; at: number; error?: string } | null = null;
const MODEL_HEALTH_TTL_MS = 10 * 60 * 1000;

/** Cheap probe so a bad model name doesn't silently dump everyone to length heuristic forever. */
export async function checkJobScoringModelHealth(): Promise<{
  ok: boolean;
  model: string;
  error?: string;
}> {
  if (
    lastModelHealth &&
    Date.now() - lastModelHealth.at < MODEL_HEALTH_TTL_MS
  ) {
    return {
      ok: lastModelHealth.ok,
      model: JOB_SCORING_MODEL,
      error: lastModelHealth.error,
    };
  }
  try {
    assertGrokConfigured();
    const response = await grokClient.responses.create({
      model: JOB_SCORING_MODEL,
      input: [
        {
          role: "user",
          content: 'Reply with JSON only: {"ok":true}',
        },
      ],
      stream: false,
    });
    const text =
      typeof response.output_text === "string" ? response.output_text : "";
    const ok = /ok/i.test(text);
    lastModelHealth = { ok, at: Date.now(), error: ok ? undefined : "unexpected response" };
    return { ok, model: JOB_SCORING_MODEL, error: lastModelHealth.error };
  } catch (err) {
    const error = err instanceof Error ? err.message : "model health failed";
    lastModelHealth = { ok: false, at: Date.now(), error };
    console.warn("[jobs] scoring model health failed:", error);
    return { ok: false, model: JOB_SCORING_MODEL, error };
  }
}

async function mikeScoreWithGrok(
  input: JobApplicationInput,
): Promise<MikeJobReview> {
  assertGrokConfigured();

  const health = await checkJobScoringModelHealth();
  if (!health.ok) {
    console.warn(
      "[jobs] scoring model unhealthy — using heuristic (no SMS flag):",
      health.error,
    );
    return {
      ...applyFiltersToReview(input, heuristicMikeReview(input)),
      fallbackReason: health.error
        ? `Grok scoring unavailable (${health.error})`
        : "Grok scoring unavailable — heuristic used",
    };
  }

  let learnings = "Hiring learnings: none yet.";
  try {
    learnings = formatHiringFeedbackForMike(await listHiringRejectFeedback());
  } catch {
    // ignore — scoring still works
  }

  const response = await grokClient.responses.create({
    model: JOB_SCORING_MODEL,
    input: [
      {
        role: "system",
        content: [
          "You are Mike, Operations Manager for Party Perfect Event Rentals in Tulsa, Oklahoma.",
          "Score job applicants 0–100 using Party Perfect’s real selection rules below.",
          HIRING_SELECTION_PLAYBOOK,
          learnings,
          "Do NOT force a rigid starting title — recommend the best department fit under those rules.",
          "Departments: Showroom, Sales, Lines Department, Delivery Team, Tents Crew, or Open/float.",
          "We are always hiring for all positions when the candidate fits that lane.",
          "If they are crew-capable, prefer Tents Crew or Delivery Team even when they chose Open.",
          "Knockouts that should score LOW / park: crew role + no transport, crew + not OK with outdoor/50lb lift, weekends-only for tents/delivery.",
          `Flag for Josh / text leadership when score >= ${TOP_CANDIDATE_SCORE} (top candidates).`,
          "Use resumeText and videoUrl when present — they are real signals.",
          "Return ONLY valid JSON with keys:",
          'score (number), primaryFit (string), secondaryFits (string[]), summary (string, 1-2 sentences), flagForJosh (boolean), strengths (string[] max 4).',
          "summary must say if they are call-today or park/review, and which department.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            roles: input.roles.map(roleLabel),
            fullName: input.fullName,
            city: input.city,
            eligibleToWork: input.eligibleToWork,
            over18: input.over18,
            validDriverLicense: input.validDriverLicense,
            hasReliableTransport: input.hasReliableTransport,
            physicalOutdoorOk: input.physicalOutdoorOk,
            earliestStartDate: input.earliestStartDate,
            daysMissedLast3Months: input.daysMissedLast3Months,
            availabilitySlots: input.availabilitySlots,
            availability: input.availability,
            physicalAbility: input.physicalAbility,
            physicalStory: input.physicalStory,
            whyPartyPerfect: input.whyPartyPerfect,
            experience: input.experience,
            workHistory: input.workHistory,
            highSchoolGraduated: input.highSchoolGraduated,
            collegeStatus: input.collegeStatus,
            schoolingNotes: input.schoolingNotes || undefined,
            referralSource: input.referralSource || undefined,
            referralName: input.referralName || undefined,
            videoUrl: input.videoUrl || undefined,
            resumeText: input.resumeText
              ? input.resumeText.slice(0, 5000)
              : undefined,
            hasResume: Boolean(
              input.resumeFileName ||
                input.resumeBlobPathname ||
                input.resumeDataUrl ||
                input.resumeText,
            ),
          },
          null,
          2,
        ),
      },
    ],
    stream: false,
  });

  const text =
    typeof response.output_text === "string" ? response.output_text.trim() : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      ...applyFiltersToReview(input, heuristicMikeReview(input)),
      fallbackReason: "Grok returned no score JSON — heuristic used",
    };
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<MikeJobReview>;
  const fallback = heuristicMikeReview(input);
  const score = Math.max(
    0,
    Math.min(100, Number(parsed.score ?? fallback.score)),
  );

  const review: MikeJobReview = {
    score,
    primaryFit:
      typeof parsed.primaryFit === "string" && parsed.primaryFit.trim()
        ? parsed.primaryFit.trim()
        : fallback.primaryFit,
    secondaryFits: Array.isArray(parsed.secondaryFits)
      ? parsed.secondaryFits.map(String).slice(0, 3)
      : [],
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : fallback.summary,
    flagForJosh: score >= TOP_CANDIDATE_SCORE,
    scoredBy: "grok",
    strengths: Array.isArray(parsed.strengths)
      ? parsed.strengths.map(String).slice(0, 4)
      : [],
  };

  return applyFiltersToReview(input, review);
}

async function notifyTopCandidateSms(application: JobApplication) {
  if (!application.mike.flagForJosh || !getTwilioConfig()) return;
  if (application.mike.scoredBy !== "grok") return;

  const roles = application.roles.map(roleLabel).join(", ");
  const body = [
    `Mike · Top candidate (${application.mike.score}+)`,
    `${application.fullName} · score ${application.mike.score}`,
    `Fit: ${application.mike.primaryFit}`,
    `Roles: ${roles}`,
    application.mike.summary,
    `Phone: ${application.phone}`,
    `Review: Command Center → Hiring`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1500);

  for (const to of getAuthorizedManagerPhones()) {
    try {
      await sendSms({ to, body });
    } catch (error) {
      console.error(
        `[jobs] Failed to SMS ${to} about top candidate:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export async function createJobApplication(
  input: JobApplicationInput,
  options?: { id?: string },
): Promise<JobApplication> {
  let mike: MikeJobReview;
  try {
    mike = await mikeScoreWithGrok(input);
  } catch (err) {
    console.warn(
      "[jobs] Grok scoring failed — heuristic only (no SMS):",
      err instanceof Error ? err.message : err,
    );
    mike = {
      ...applyFiltersToReview(input, heuristicMikeReview(input)),
      fallbackReason: "Grok scoring failed — heuristic used",
    };
  }

  const application: JobApplication = {
    ...input,
    id: options?.id || crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    source: normalizeJobLeadSource(input.source),
    mike,
  };

  let saved = false;
  try {
    await saveJobApplication(application);
    saved = true;
  } catch (error) {
    const backup = await sendApplicationBackupEmail(application);
    throw new JobApplicationSaveError(
      backup.sent
        ? "We emailed your application to the hiring team, but our hiring database is temporarily unavailable. Please also call Party Perfect or retry in a few minutes so we do not miss you."
        : error instanceof Error
          ? error.message
          : "Could not save application. Please try again or call Party Perfect.",
      backup.sent,
    );
  }

  // Backup email every application (never miss a hire record in inbox)
  const backup = await sendApplicationBackupEmail(application);
  if (!backup.sent) {
    console.warn("[jobs] Durable save OK but backup email skipped:", backup.error);
  }

  await notifyTopCandidateSms(application);

  if (!saved) {
    throw new JobApplicationSaveError(
      "Could not confirm application save.",
      backup.sent,
    );
  }

  return application;
}

export async function listJobApplications() {
  return readJobApplicationsStore();
}

export async function getJobApplication(id: string) {
  const applications = await readJobApplicationsStore();
  return applications.find((app) => app.id === id) ?? null;
}

/** Merge optional extras onto an existing application and re-score Mike. */
export async function enrichJobApplication(
  id: string,
  patch: JobApplicationInput,
): Promise<JobApplication | null> {
  const existing = await getJobApplication(id);
  if (!existing) return null;

  const mergedInput: JobApplicationInput = {
    ...existing,
    ...patch,
    roles: patch.roles?.length ? patch.roles : existing.roles,
    fullName: patch.fullName.trim() || existing.fullName,
    phone: patch.phone.trim() || existing.phone,
    email: patch.email.trim() || existing.email,
    city: patch.city.trim() || existing.city,
    applyMode: "enrich",
    source: existing.source,
  };

  let mike: MikeJobReview;
  try {
    mike = await mikeScoreWithGrok(mergedInput);
  } catch (err) {
    console.warn(
      "[jobs] Grok re-score failed on enrich — heuristic:",
      err instanceof Error ? err.message : err,
    );
    mike = {
      ...applyFiltersToReview(mergedInput, heuristicMikeReview(mergedInput)),
      fallbackReason: "Grok re-score failed — heuristic used",
    };
  }

  const application: JobApplication = {
    ...existing,
    ...mergedInput,
    id: existing.id,
    submittedAt: existing.submittedAt,
    source: existing.source,
    mike,
  };

  await saveJobApplication(application);
  return application;
}

export async function deleteJobApplication(
  id: string,
  options?: {
    reasonId?: string;
    notes?: string;
    outcome?: "hired" | "rejected";
  },
) {
  const app = await getJobApplication(id);
  if (!app) return false;

  const reasonId = options?.reasonId?.trim();
  if (!reasonId) {
    throw new Error(
      "Mike needs Hired or Rejected + a reason — pick why so he can learn how to score applicants.",
    );
  }

  const outcome = options?.outcome === "hired" ? "hired" : "rejected";
  await recordHiringRejectFeedback({
    applicationId: app.id,
    outcome,
    reasonId,
    notes: options?.notes,
    fullName: app.fullName,
    roles: app.roles,
    city: app.city,
    mikeScore: app.mike.score,
    primaryFit: app.mike.primaryFit,
  });

  return removeJobApplication(id);
}

export function getJobApplicationsStoreMode() {
  return jobStoreMode();
}
