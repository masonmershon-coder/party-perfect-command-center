import {
  formatPhoneDisplay,
  getManagerPhone,
  getTwilioPublicStatus,
  sendSms,
} from "@/lib/twilio";
import { createReport } from "@/lib/storage";
import { generateWeeklyRecapMessage } from "@/lib/weekly-recap";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_ACTIONS = new Set(["weekly-recap", "test-sample"]);

function reportTitle() {
  return `Weekly Operations Recap — ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date())}`;
}

export async function GET() {
  return NextResponse.json({ twilio: getTwilioPublicStatus() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: string;
    } | null;

    const action = body?.action?.trim();

    if (!action || !ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json(
        {
          error:
            'Invalid action. Use "weekly-recap" or "test-sample".',
        },
        { status: 400 },
      );
    }

    const managerPhone = getManagerPhone();

    if (action === "test-sample") {
      const sampleBody =
        "Party Perfect Command Center test: Twilio SMS is working. — Mike (Operations)";
      const result = await sendSms({
        to: managerPhone,
        body: sampleBody,
      });

      return NextResponse.json({
        success: true,
        message: `✅ Text sent successfully from ${formatPhoneDisplay(result.from)}`,
        from: result.from,
        fromDisplay: formatPhoneDisplay(result.from),
        to: result.to,
        toDisplay: formatPhoneDisplay(result.to),
        twilioSid: result.sid,
        body: sampleBody,
      });
    }

    const recap = await generateWeeklyRecapMessage();
    const result = await sendSms({
      to: managerPhone,
      body: recap,
    });

    await createReport({
      type: "weekly-recap",
      title: reportTitle(),
      content: recap,
      generatedAt: new Date().toISOString(),
      sentViaSms: true,
      twilioSid: result.sid,
      generatedBy: "mike-operations",
    });

    return NextResponse.json({
      success: true,
      message: `✅ Text sent successfully from ${formatPhoneDisplay(result.from)}`,
      from: result.from,
      fromDisplay: formatPhoneDisplay(result.from),
      to: result.to,
      toDisplay: formatPhoneDisplay(result.to),
      recap,
      twilioSid: result.sid,
      reportSaved: true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send SMS.";
    const status = message.includes("not configured")
      ? 503
      : message.includes("incomplete")
        ? 503
        : 500;

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
