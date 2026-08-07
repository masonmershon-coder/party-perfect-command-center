import { createReport } from "@/lib/storage";
import { sendWeeklyRecapEmail } from "@/lib/weekly-recap-mail";
import {
  generateWeeklyRecapEmailBody,
  generateWeeklyRecapMessage,
} from "@/lib/weekly-recap";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Monday weekly recap email to Josh (info@mershonevents.com by default).
 * Vercel Cron: 0 14 * * 1 → Monday 9:00 AM America/Chicago (CDT).
 * Secure with CRON_SECRET — Authorization: Bearer <CRON_SECRET>.
 */
function authorize(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const query = new URL(request.url).searchParams.get("secret") || "";
  return bearer === secret || query === secret;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [emailBody, smsBody] = await Promise.all([
      generateWeeklyRecapEmailBody(),
      generateWeeklyRecapMessage(),
    ]);

    const mail = await sendWeeklyRecapEmail({ emailBody, smsBody });

    await createReport({
      type: "weekly-recap",
      title: `Weekly Operations Recap — ${new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Chicago",
      }).format(new Date())}`,
      content: emailBody,
      generatedAt: new Date().toISOString(),
      sentViaSms: false,
      generatedBy: "mike-operations",
    });

    return NextResponse.json({
      ok: mail.sent,
      ranAt: new Date().toISOString(),
      emailedTo: mail.to,
      emailSent: mail.sent,
      emailError: mail.error || null,
      smsPreview: smsBody,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Weekly recap failed",
      },
      { status: 500 },
    );
  }
}
