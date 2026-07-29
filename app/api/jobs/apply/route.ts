import { createJobApplication } from "@/lib/job-applications";
import {
  JOB_ROLES,
  type JobApplicationInput,
  type JobRoleId,
  type WorkHistoryEntry,
} from "@/lib/jobs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ROLE_IDS = new Set(JOB_ROLES.map((role) => role.id));

function cleanText(value: unknown, max = 800) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<
      JobApplicationInput
    > | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid application payload." }, { status: 400 });
    }

    const roles = Array.isArray(body.roles)
      ? body.roles
          .map(String)
          .filter((role): role is JobRoleId => ROLE_IDS.has(role as JobRoleId))
      : [];

    if (roles.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one role interest." },
        { status: 400 },
      );
    }

    const input: JobApplicationInput = {
      roles,
      fullName: cleanText(body.fullName, 120),
      phone: cleanText(body.phone, 40),
      email: cleanText(body.email, 160).toLowerCase(),
      city: cleanText(body.city, 80),
      eligibleToWork:
        body.eligibleToWork === "yes" || body.eligibleToWork === "no"
          ? body.eligibleToWork
          : "",
      over18:
        body.over18 === "yes" || body.over18 === "no" ? body.over18 : "",
      validDriverLicense:
        body.validDriverLicense === "yes" || body.validDriverLicense === "no"
          ? body.validDriverLicense
          : "",
      availability: cleanText(body.availability, 400),
      physicalAbility: cleanText(body.physicalAbility, 400),
      whyPartyPerfect: cleanText(body.whyPartyPerfect, 500),
      experience: cleanText(body.experience, 600),
      workHistory: cleanWorkHistory(body.workHistory),
      videoUrl: cleanText(body.videoUrl, 400) || undefined,
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
      !input.availability ||
      !input.physicalAbility ||
      !input.whyPartyPerfect
    ) {
      return NextResponse.json(
        { error: "Please complete availability, physical ability, and why Party Perfect." },
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

    const application = await createJobApplication(input);

    return NextResponse.json({
      success: true,
      id: application.id,
      // Applicant-facing: warm placement hint only (no raw score)
      primaryFit: application.mike.primaryFit,
      message:
        "Application received! Mike is reviewing your fit for the Party Perfect crew.",
      // Internal fields kept for future Command Center — not advertised in UI
      review: {
        score: application.mike.score,
        flagForJosh: application.mike.flagForJosh,
        secondaryFits: application.mike.secondaryFits,
        summary: application.mike.summary,
      },
    });
  } catch (error) {
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
