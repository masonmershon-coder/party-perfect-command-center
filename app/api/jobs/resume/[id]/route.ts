import { getJobApplication } from "@/lib/job-applications";
import { applicationHasResume, readJobResumeBytes } from "@/lib/job-resume";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Stream an applicant resume for Command Center Hiring review.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const app = await getJobApplication(id);
    if (!app || !applicationHasResume(app)) {
      return new NextResponse("Resume not found", { status: 404 });
    }

    const stored = await readJobResumeBytes({
      blobPathname: app.resumeBlobPathname,
      dataUrl: app.resumeDataUrl,
      mimeType: app.resumeMimeType,
    });
    if (!stored) {
      return new NextResponse("Resume file missing from storage", {
        status: 404,
      });
    }

    const fileName = app.resumeFileName || "resume.pdf";
    const disposition = /\.pdf$/i.test(fileName) || stored.mimeType.includes("pdf")
      ? "inline"
      : "attachment";

    return new NextResponse(new Uint8Array(stored.bytes), {
      headers: {
        "Content-Type": stored.mimeType,
        "Content-Disposition": `${disposition}; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load resume.",
      },
      { status: 500 },
    );
  }
}
