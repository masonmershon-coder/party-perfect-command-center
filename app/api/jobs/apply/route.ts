import { enforceJobApplyRateLimits } from "@/lib/job-apply-rate-limit";
import {
  availabilityLabelFromSlots,
  cleanAvailabilitySlots,
  findRecentDuplicate,
  sanitizeVideoUrl,
  validateJobApplicationInput,
} from "@/lib/job-apply-validate";
import { normalizeJobLeadSource } from "@/lib/job-lead-sources";
import {
  createJobApplication,
  enrichJobApplication,
  getJobApplication,
  JobApplicationSaveError,
  listJobApplications,
} from "@/lib/job-applications";
import { extractResumeText } from "@/lib/job-resume-text";
import { storeJobResume } from "@/lib/job-resume";
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
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

const ROLE_IDS = new Set(JOB_ROLES.map((role) => role.id));
const COLLEGE = new Set<CollegeStatus>([
  "none",
  "some",
  "graduated",
  "in_progress",
]);
const REFERRALS = new Set<string>(
  JOB_REFERRAL_SOURCES.map((row) => row.id),
);

function cleanText(value: unknown, max = 800) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function cleanYesNo(value: unknown): "yes" | "no" | "" {
  return value === "yes" || value === "no" ? value : "";
}

function cleanCollege(value: unknown): CollegeStatus {
  const v = String(value ?? "").trim() as CollegeStatus;
  return COLLEGE.has(v) ? v : "";
}

function cleanReferralSource(value: unknown): JobReferralSourceId {
  const v = String(value ?? "").trim();
  return REFERRALS.has(v) ? (v as JobReferralSourceId) : "";
}

function cleanWorkHistory(value: unknown): WorkHistoryEntry[] {
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

function parseBodyRoles(raw: unknown): JobRoleId[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(String)
    .filter((role): role is JobRoleId => ROLE_IDS.has(role as JobRoleId));
}

async function parseApplyRequest(request: Request): Promise<{
  body: Partial<JobApplicationInput> & { company_website?: string };
  resumeFile: File | null;
}> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payloadRaw = form.get("payload");
    let body: Partial<JobApplicationInput> & { company_website?: string } = {};
    if (typeof payloadRaw === "string" && payloadRaw.trim()) {
      body = JSON.parse(payloadRaw) as Partial<JobApplicationInput> & {
        company_website?: string;
      };
    } else {
      // Flat form fields fallback
      const rolesRaw = form.get("roles");
      body = {
        roles: typeof rolesRaw === "string" ? JSON.parse(rolesRaw) : [],
        fullName: String(form.get("fullName") || ""),
        phone: String(form.get("phone") || ""),
        email: String(form.get("email") || ""),
        city: String(form.get("city") || ""),
        eligibleToWork: cleanYesNo(form.get("eligibleToWork")),
        over18: cleanYesNo(form.get("over18")),
        validDriverLicense: cleanYesNo(form.get("validDriverLicense")),
        highSchoolGraduated: cleanYesNo(form.get("highSchoolGraduated")),
        collegeStatus: cleanCollege(form.get("collegeStatus")),
        schoolingNotes: String(form.get("schoolingNotes") || ""),
        referralSource: cleanReferralSource(form.get("referralSource")),
        referralName: String(form.get("referralName") || ""),
        availability: String(form.get("availability") || ""),
        physicalAbility: String(form.get("physicalAbility") || ""),
        whyPartyPerfect: String(form.get("whyPartyPerfect") || ""),
        experience: String(form.get("experience") || ""),
        workHistory: cleanWorkHistory(
          typeof form.get("workHistory") === "string"
            ? JSON.parse(String(form.get("workHistory")))
            : [],
        ),
        videoUrl: String(form.get("videoUrl") || "") || undefined,
        source: String(form.get("source") || "") || undefined,
        company_website: String(form.get("company_website") || ""),
      };
    }
    // Honeypot may also be a top-level form field
    if (!body.company_website && form.get("company_website")) {
      body.company_website = String(form.get("company_website") || "");
    }
    const resume = form.get("resume");
    return {
      body,
      resumeFile: resume instanceof File && resume.size > 0 ? resume : null,
    };
  }

  const body = (await request.json().catch(() => null)) as
    | (Partial<JobApplicationInput> & { company_website?: string })
    | null;
  if (!body) {
    throw new Error("Invalid application payload.");
  }
  return { body, resumeFile: null };
}

export async function POST(request: Request) {
  const ip = clientIp(request);

  try {
    let parsed: {
      body: Partial<JobApplicationInput> & { company_website?: string };
      resumeFile: File | null;
    };
    try {
      parsed = await parseApplyRequest(request);
    } catch {
      return NextResponse.json(
        { error: "Invalid application payload." },
        { status: 400 },
      );
    }

    // Honeypot — bots fill hidden company_website; humans never see it.
    if (String(parsed.body.company_website || "").trim()) {
      return NextResponse.json({
        success: true,
        id: crypto.randomUUID(),
        message:
          "Thank you for applying to Party Perfect Event Rentals. We’ve received your application and will be in touch.",
      });
    }

    const { body, resumeFile } = parsed;
    const roles = parseBodyRoles(body.roles);

    if (roles.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one role interest." },
        { status: 400 },
      );
    }

    const rateError = await enforceJobApplyRateLimits({
      ip,
      email: String(body.email || ""),
      phone: String(body.phone || ""),
    });
    if (rateError) {
      return NextResponse.json({ error: rateError }, { status: 429 });
    }

    const enrichId = cleanText(
      (body as { applicationId?: string }).applicationId,
      80,
    );
    const applyModeRaw = String(
      (body as { applyMode?: string }).applyMode || "",
    ).trim();
    if (applyModeRaw === "quick") {
      return NextResponse.json(
        {
          error:
            "Quick Apply is no longer available. Please complete the full application.",
        },
        { status: 400 },
      );
    }
    const applyMode =
      applyModeRaw === "enrich" || applyModeRaw === "full"
        ? applyModeRaw
        : enrichId
          ? "enrich"
          : "full";
    if (applyMode === "enrich" && !enrichId) {
      return NextResponse.json(
        { error: "Full application required." },
        { status: 400 },
      );
    }

    const applicationId = enrichId || crypto.randomUUID();
    let resumeFields: Partial<JobApplicationInput> = {};
    if (resumeFile) {
      try {
        const bytes = Buffer.from(await resumeFile.arrayBuffer());
        const stored = await storeJobResume({
          bytes,
          mimeType: resumeFile.type || "application/octet-stream",
          fileName: resumeFile.name || "resume.pdf",
          applicationId,
        });
        const resumeText = await extractResumeText({
          bytes,
          mimeType: stored.mimeType || resumeFile.type,
          fileName: stored.fileName || resumeFile.name,
        });
        resumeFields = {
          resumeFileName: stored.fileName,
          resumeMimeType: stored.mimeType,
          resumeBlobPathname: stored.blobPathname,
          resumeDataUrl: stored.dataUrl,
          ...(resumeText ? { resumeText } : {}),
        };
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? err.message
                : "Could not save resume. Try PDF under 8MB, or apply without resume.",
          },
          { status: 400 },
        );
      }
    }

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

    const input: JobApplicationInput = {
      roles,
      fullName: cleanText(body.fullName, 120),
      phone: cleanText(body.phone, 40),
      email: cleanText(body.email, 160).toLowerCase(),
      city: cleanText(body.city, 80),
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
      ...resumeFields,
    };

    const validationError = validateJobApplicationInput(input, {
      mode: applyMode,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (enrichId) {
      const prior = await getJobApplication(enrichId);
      if (!prior) {
        return NextResponse.json(
          { error: "Application not found — start a new application." },
          { status: 404 },
        );
      }
      const enriched = await enrichJobApplication(enrichId, input);
      return NextResponse.json({
        success: true,
        id: enriched?.id || enrichId,
        message:
          "Thanks — we saved your extra details. Watch your phone; we’ll be in touch.",
      });
    }

    const existing = await listJobApplications();
    const duplicate = findRecentDuplicate(existing, input.phone, input.email);
    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "Looks like you already applied recently with this phone or email. We’ll be in touch — no need to re-apply.",
          reasonId: "duplicate",
        },
        { status: 409 },
      );
    }

    const application = await createJobApplication(input, { id: applicationId });

    // Applicant-facing only — never expose Mike score / primaryFit / department lean.
    return NextResponse.json({
      success: true,
      id: application.id,
      message:
        "Thank you for applying to Party Perfect Event Rentals. We’ve received your application and will be in touch.",
    });
  } catch (error) {
    if (error instanceof JobApplicationSaveError) {
      return NextResponse.json(
        {
          error: error.message,
          backupEmailed: error.backupEmailed,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not submit application.",
      },
      { status: 500 },
    );
  }
}
