import { assertGrokConfigured, grokClient } from "@/lib/grok";
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
  writeJobApplicationsStore,
} from "./job-store";
import {
  getAuthorizedManagerPhones,
  getTwilioConfig,
  sendSms,
} from "./twilio";

async function mikeScoreWithGrok(
  input: JobApplicationInput,
): Promise<MikeJobReview> {
  assertGrokConfigured();

  const response = await grokClient.responses.create({
    model: "grok-build-0.1",
    input: [
      {
        role: "system",
        content: [
          "You are Mike, Operations Manager for Party Perfect Event Rentals in Tulsa, Oklahoma.",
          "Score job applicants 0–100 for fit, energy, reliability signals, and role match.",
          "Do NOT force a rigid starting title — recommend the best department fit.",
          "Departments: Showroom, Sales, Lines Department, Delivery Team, Tents Crew, or Open/float.",
          `Flag for Josh / text leadership when score >= ${TOP_CANDIDATE_SCORE} (top candidates).`,
          "Return ONLY valid JSON with keys:",
          'score (number), primaryFit (string), secondaryFits (string[]), summary (string, 1-2 sentences), flagForJosh (boolean), strengths (string[] max 4).',
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
            hasVideo: Boolean(input.videoUrl?.trim()),
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

export async function createJobApplication(
  input: JobApplicationInput,
): Promise<JobApplication> {
  let mike: MikeJobReview;
  try {
    mike = await mikeScoreWithGrok(input);
  } catch {
    mike = heuristicMikeReview(input);
  }

  const application: JobApplication = {
    ...input,
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
    source: "partyperfectjobs",
    mike,
  };

  const existing = await readJobApplicationsStore();
  existing.unshift(application);
  await writeJobApplicationsStore(existing);

  if (application.mike.flagForJosh && getTwilioConfig()) {
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

  return application;
}

export async function listJobApplications() {
  return readJobApplicationsStore();
}

export async function getJobApplication(id: string) {
  const applications = await readJobApplicationsStore();
  return applications.find((app) => app.id === id) ?? null;
}

export async function deleteJobApplication(id: string) {
  const applications = await readJobApplicationsStore();
  const next = applications.filter((app) => app.id !== id);
  if (next.length === applications.length) return false;
  await writeJobApplicationsStore(next);
  return true;
}

export function getJobApplicationsStoreMode() {
  return jobStoreMode();
}
