import {
  deleteJobApplication,
  getJobApplicationsStoreMode,
  listJobApplications,
} from "@/lib/job-applications";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Internal list for Mike / Command Center — top candidates first. */
export async function GET() {
  const applications = await listJobApplications();
  const sorted = [...applications].sort((a, b) => {
    if (a.mike.flagForJosh !== b.mike.flagForJosh) {
      return a.mike.flagForJosh ? -1 : 1;
    }
    return b.mike.score - a.mike.score;
  });

  return NextResponse.json({
    total: sorted.length,
    flaggedForJosh: sorted.filter((app) => app.mike.flagForJosh).length,
    storeMode: getJobApplicationsStoreMode(),
    applications: sorted,
  });
}

/** Close one application — Hired or Rejected with a required reason so Mike learns. */
export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      id?: string;
      reasonId?: string;
      notes?: string;
      outcome?: "hired" | "rejected";
    } | null;
    const id = body?.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    const reasonId = body?.reasonId?.trim();
    if (!reasonId) {
      return NextResponse.json(
        {
          error:
            "Choose Hired or Rejected and pick a reason so Mike can learn how to score applicants.",
        },
        { status: 400 },
      );
    }

    const deleted = await deleteJobApplication(id, {
      reasonId,
      notes: body?.notes,
      outcome: body?.outcome === "hired" ? "hired" : "rejected",
    });
    if (!deleted) {
      return NextResponse.json(
        { error: "Application not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      id,
      outcome: body?.outcome === "hired" ? "hired" : "rejected",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not close application.",
      },
      { status: 500 },
    );
  }
}
