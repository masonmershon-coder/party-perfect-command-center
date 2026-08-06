import { sendApplicationBackupEmail } from "@/lib/application-mail";
import { assertGrokConfigured, grokClient } from "@/lib/grok";
import {
  formatHiringFeedbackForMike,
  listHiringRejectFeedback,
  recordHiringRejectFeedback,
  type HireRejectReasonId,
} from "@/lib/hiring-feedback";
import { HIRING_SELECTION_PLAYBOOK } from "@/lib/hiring-selection-playbook";
import {
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

export class JobApplicationSaveError extends Error {
  readonly backupEmailed: boolean;

  constructor(message: string, backupEmailed: boolean) {
    super(message);
    this.name = "JobApplicationSaveError";
    this.backupEmailed = backupEmailed;
  }
}

async function mikeScoreWithGrok(
  input: JobApplicationInput,
): Promise<MikeJobReview> {
  assertGrokConfigured();

  let learnings = "Hiring learnings: none yet.";
  try {
    learnings = formatHiringFeedbackForMike(await listHiringRejectFeedback());
  } catch {
    // ignore — scoring still works
  }

  const response = await grokClient.responses.create({
    model: "grok-build-0.1",
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
          `Flag for Josh / text leadership when score >= ${TOP_CANDIDATE_SCORE} (top candidates).`,
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
            availability: input.availability,
            physicalAbility: input.physicalAbility,
            whyPartyPerfect: input.whyPartyPerfect,
            experience: input.experience,
            workHistory: input.workHistory,
            highSchoolGraduated: input.highSchoolGraduated,
            collegeStatus: input.collegeStatus,
            schoolingNotes: input.schoolingNotes || undefined,
            hasVideo: Boolean(input.videoUrl?.trim()),
            hasResume: Boolean(
              input.resumeFileName ||
                input.resumeBlobPathname ||
                input.resumeDataUrl,
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
    return heuristicMikeReview(input);
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<MikeJobReview>;
  const score = Math.max(
    0,
    Math.min(100, Number(parsed.score ?? heuristicMikeReview(input).score)),
  );

  return {
    score,
    primaryFit:
      typeof parsed.primaryFit === "string" && parsed.primaryFit.trim()
        ? parsed.primaryFit.trim()
        : heuristicMikeReview(input).primaryFit,
    secondaryFits: Array.isArray(parsed.secondaryFits)
      ? parsed.secondaryFits.map(String).slice(0, 3)
      : [],
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : heuristicMikeReview(input).summary,
    // Always derive from score so threshold stays consistent.
    flagForJosh: score >= TOP_CANDIDATE_SCORE,
    strengths: Array.isArray(parsed.strengths)
      ? parsed.strengths.map(String).slice(0, 4)
      : [],
  };
}

async function notifyTopCandidateSms(application: JobApplication) {
  if (!application.mike.flagForJosh || !getTwilioConfig()) return;

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
  } catch {
    mike = heuristicMikeReview(input);
  }

  const application: JobApplication = {
    ...input,
    id: options?.id || crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    source: "partyperfectjobs",
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
    fullName: app.fullName,
    roles: app.roles,
    city: app.city,
    mikeScore: app.mike.score,
    primaryFit: app.mike.primaryFit,
    reasonId: reasonId as HireRejectReasonId,
    notes: options?.notes,
    outcome,
  });

  return removeJobApplication(id);
}

export function getJobApplicationsStoreMode() {
  return jobStoreMode();
}
