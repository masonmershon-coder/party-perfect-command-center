import { exportDashboardToGitHub } from "@/lib/github";
import { loadDashboardExport } from "@/lib/storage";
import type { GitHubExportInput } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN is not configured. Add it to .env.local." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as GitHubExportInput;
    const repo = body.repo ?? process.env.GITHUB_REPO;

    if (!repo) {
      return NextResponse.json(
        {
          error:
            "Repository is required. Pass repo in the request body or set GITHUB_REPO in .env.local.",
        },
        { status: 400 },
      );
    }

    const payload = await loadDashboardExport();
    const result = await exportDashboardToGitHub({
      repo,
      branch: body.branch,
      message: body.message,
      payload,
      token,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export to GitHub.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
