import { createJobApplication, JobApplicationSaveError } from "@/lib/job-applications";
import { storeJobResume } from "@/lib/job-resume";
import {
  JOB_ROLES,
  type CollegeStatus,
  type JobApplicationInput,
  type JobRoleId,
  type WorkHistoryEntry,
} from "@/lib/jobs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ROLE_IDS = new Set(JOB_ROLES.map((role) => role.id));
const COLLEGE = new Set<CollegeStatus>([
  "none",
  "some",
  "graduated",
  "in_progress",
]);

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
  body: Partial<JobApplicationInput>;
  resumeFile: File | null;
}> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payloadRaw = form.get("payload");
    let body: Partial<JobApplicationInput> = {};
    if (typeof payloadRaw === "string" && payloadRaw.trim()) {
      body = JSON.parse(payloadRaw) as Partial<JobApplicationInput>;
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
      };
    }
    const resume = form.get("resume");
    return {
      body,
      resumeFile: resume instanceof File && resume.size > 0 ? resume : null,
    };
  }

  const body = (await request.json().catch(() => null)) as Partial<
    JobApplicationInput
  > | null;
  if (!body) {
    throw new Error("Invalid application payload.");
  }
  return { body, resumeFile: null };
}

export async function POST(request: Request) {
  try {
    let parsed: { body: Partial<JobApplicationInput>; resumeFile: File | null };
    try {
      parsed = await parseApplyRequest(request);
    } catch {
      return NextResponse.json(
        { error: "Invalid application payload." },
        { status: 400 },
      );
    }

    const { body, resumeFile } = parsed;
    const roles = parseBodyRoles(body.roles);

    if (roles.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one role interest." },
        { status: 400 },
      );
    }

    const applicationId = crypto.randomUUID();
    let resumeFields: Partial<JobApplicationInput> = {};
    if (resumeFile) {
      try {
        const stored = await storeJobResume({
          bytes: Buffer.from(await resumeFile.arrayBuffer()),
          mimeType: resumeFile.type || "application/octet-stream",
          fileName: resumeFile.name || "resume.pdf",
          applicationId,
        });
        resumeFields = {
          resumeFileName: stored.fileName,
          resumeMimeType: stored.mimeType,
          resumeBlobPathname: stored.blobPathname,
          resumeDataUrl: stored.dataUrl,
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

    const input: JobApplicationInput = {
      roles,
      fullName: cleanText(body.fullName, 120),
      phone: cleanText(body.phone, 40),
      email: cleanText(body.email, 160).toLowerCase(),
      city: cleanText(body.city, 80),
      eligibleToWork: cleanYesNo(body.eligibleToWork),
      over18: cleanYesNo(body.over18),
      validDriverLicense: cleanYesNo(body.validDriverLicense),
      highSchoolGraduated: cleanYesNo(body.highSchoolGraduated),
      collegeStatus: cleanCollege(body.collegeStatus),
      schoolingNotes: cleanText(body.schoolingNotes, 200) || undefined,
      availability: cleanText(body.availability, 400),
      physicalAbility: cleanText(body.physicalAbility, 400),
      whyPartyPerfect: cleanText(body.whyPartyPerfect, 500),
      experience: cleanText(body.experience, 600),
      workHistory: cleanWorkHistory(body.workHistory),
      videoUrl: cleanText(body.videoUrl, 400) || undefined,
      ...resumeFields,
    };

    if (!input.fullName || !input.phone || !input.email) {
      return NextResponse.json(
        { error: "Name, phone, and email are required." },
        { status: 400 },
      );
    }

    if (!input.email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }

    if (input.eligibleToWork !== "yes" || input.over18 !== "yes") {
      return NextResponse.json(
        {
          error:
            "Applicants must be 18+ and eligible to work in the U.S. to continue.",
        },
        { status: 400 },
      );
    }

    if (
      input.validDriverLicense !== "yes" &&
      input.validDriverLicense !== "no"
    ) {
      return NextResponse.json(
        { error: "Please answer whether you have a valid driver’s license." },
        { status: 400 },
      );
    }

    if (
      input.highSchoolGraduated !== "yes" &&
      input.highSchoolGraduated !== "no"
    ) {
      return NextResponse.json(
        { error: "Please answer high school / GED in the Schooling box on step 1." },
        { status: 400 },
      );
    }

    if (!input.collegeStatus) {
      return NextResponse.json(
        { error: "Please pick a college option in the Schooling box on step 1 (No college is fine)." },
        { status: 400 },
      );
    }

    if (
      !input.availability ||
      !input.physicalAbility ||
      !input.whyPartyPerfect
    ) {
      return NextResponse.json(
        {
          error:
            "Please complete availability, physical ability, and why Party Perfect.",
        },
        { status: 400 },
      );
    }

    const incompleteHistory = input.workHistory.find(
      (entry) =>
        !entry.employer ||
        !entry.startDate ||
        !entry.startPay ||
        (!entry.stillEmployed && (!entry.endDate || !entry.endPay)) ||
        (entry.stillEmployed && !entry.endPay),
    );
    if (input.workHistory.length === 0 || incompleteHistory) {
      return NextResponse.json(
        {
          error:
            "Add at least one job from the last 3 years with employer, dates, and start/end pay.",
        },
        { status: 400 },
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
