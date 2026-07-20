import { createReport, listReports } from "@/lib/storage";
import { generateWeeklyRecapMessage } from "@/lib/weekly-recap";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const reports = await listReports();
  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
    };

    if (body.action !== "generate-weekly-recap") {
      return NextResponse.json(
        { error: "Invalid action. Use generate-weekly-recap." },
        { status: 400 },
      );
    }

    const content = await generateWeeklyRecapMessage();
    const report = await createReport({
      type: "weekly-recap",
      title: `Weekly Operations Recap — ${new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date())}`,
      content,
      generatedAt: new Date().toISOString(),
      sentViaSms: false,
      generatedBy: "mike-operations",
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
