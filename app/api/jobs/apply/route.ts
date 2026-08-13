import { enforceJobApplyRateLimits } from "@/lib/job-apply-rate-limit";
import {
  buildJobApplicationInputFromBody,
  cleanCollege,
  cleanReferralSource,
  cleanWorkHistory,
  cleanYesNo,
  parseBodyRoles,
  resolveApplyMode,
  type ApplyBody,
} from "@/lib/job-apply-intake";
import {
  findRecentDuplicate,
  validateJobApplicationInput,
} from "@/lib/job-apply-validate";
import {
  createJobApplication,
  enrichJobApplication,
  getJobApplication,
  JobApplicationSaveError,
  listJobApplications,
} from "@/lib/job-applications";
import { extractResumeText } from "@/lib/job-resume-text";
import { storeJobResume } from "@/lib/job-resume";
import { type JobApplicationInput } from "@/lib/jobs";
import { screenUntrusted } from "@/lib/matter-gateway";
import { recordInjectionSignals } from "@/lib/sentinel-telemetry";
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

async function parseApplyRequest(request: Request): Promise<{
  body: ApplyBody;
  resumeFile: File | null;
}> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payloadRaw = form.get("payload");
    let body: ApplyBody = {};
    if (typeof payloadRaw === "string" && payloadRaw.trim()) {
      body = JSON.parse(payloadRaw) as ApplyBody;
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

  const body = (await request.json().catch(() => null)) as ApplyBody | null;
  if (!body) {
    throw new Error("Invalid application payload.");
  }
  return { body, resumeFile: null };
}

export async function POST(request: Request) {
  const ip = clientIp(request);

  try {
    let parsed: {
      body: ApplyBody;
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

    const mode = resolveApplyMode(body);
    if (mode.error) {
      return NextResponse.json({ error: mode.error }, { status: 400 });
    }
    const { applyMode, enrichId } = mode;

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

    const input: JobApplicationInput = buildJobApplicationInputFromBody(body, {
      applyMode,
      ...resumeFields,
    });

    const validationError = validateJobApplicationInput(input, {
      mode: applyMode,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const injectionText = [
      input.physicalStory,
      input.whyPartyPerfect,
      input.experience,
      input.availability,
      input.schoolingNotes,
      input.resumeText,
      ...(input.workHistory || []).flatMap((row) => [
        row.employer,
        row.roleTitle,
      ]),
    ]
      .filter(Boolean)
      .join("\n");
    const injection = screenUntrusted(injectionText);
    if (injection.flagged) {
      void recordInjectionSignals({
        surface: "jobs.apply",
        signalCount: injection.signalCount,
        signalIds: injection.signalIds,
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      });
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
