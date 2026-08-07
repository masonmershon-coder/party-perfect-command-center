import {
  formatPhoneDisplay,
  getAuthorizedManagerPhones,
  getTwilioPublicStatus,
  sendSms,
  sendSmsToManagers,
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

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

function normalizeUsPhone(phone: string) {
  const digits = digitsOnly(phone);
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  const trimmed = phone.trim();
  return trimmed.startsWith("+") ? trimmed : `+${digits}`;
}

/** Explicit `to` must be an authorized manager; omit `to` to fan-out to all. */
function resolveRecipient(requestedTo?: string) {
  if (!requestedTo?.trim()) return null;

  const normalized = normalizeUsPhone(requestedTo);
  const allowed = new Set(
    getAuthorizedManagerPhones().map((p) =>
      digitsOnly(p).replace(/^1/, ""),
    ),
  );

  const key = digitsOnly(normalized).replace(/^1/, "");
  if (!allowed.has(key)) {
    throw new Error(
      "Recipient not allowed. Use an authorized manager phone.",
    );
  }
  return normalized;
}

export async function GET() {
  return NextResponse.json({
    twilio: getTwilioPublicStatus(),
    managers: getAuthorizedManagerPhones().map(formatPhoneDisplay),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      to?: string;
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

    const singleTo = resolveRecipient(body?.to);

    if (action === "test-sample") {
      const sampleBody =
        "Party Perfect Command Center test: Twilio SMS is working. — Mike (Operations)";

      if (singleTo) {
        const result = await sendSms({ to: singleTo, body: sampleBody });
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

      const fanout = await sendSmsToManagers(sampleBody);
      return NextResponse.json({
        success: fanout.sentCount > 0,
        message:
          fanout.sentCount > 0
            ? `✅ Test sent to ${fanout.sentCount} manager phone(s) from ${formatPhoneDisplay(fanout.from || "")}`
            : "Failed to send test SMS to any manager phone",
        from: fanout.from,
        fromDisplay: fanout.from ? formatPhoneDisplay(fanout.from) : null,
        results: fanout.results.map((r) => ({
          ...r,
          toDisplay: formatPhoneDisplay(r.to),
        })),
        body: sampleBody,
      });
    }

    const recap = await generateWeeklyRecapMessage();

    if (singleTo) {
      const result = await sendSms({ to: singleTo, body: recap });
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
    }

    const fanout = await sendSmsToManagers(recap);
    const firstSid = fanout.results.find((r) => r.ok)?.sid;
    await createReport({
      type: "weekly-recap",
      title: reportTitle(),
      content: recap,
      generatedAt: new Date().toISOString(),
      sentViaSms: fanout.sentCount > 0,
      twilioSid: firstSid,
      generatedBy: "mike-operations",
    });

    return NextResponse.json({
      success: fanout.sentCount > 0,
      message:
        fanout.sentCount > 0
          ? `✅ Recap sent to ${fanout.sentCount} manager phone(s) from ${formatPhoneDisplay(fanout.from || "")}`
          : "Failed to send recap to any manager phone",
      from: fanout.from,
      fromDisplay: fanout.from ? formatPhoneDisplay(fanout.from) : null,
      results: fanout.results.map((r) => ({
        ...r,
        toDisplay: formatPhoneDisplay(r.to),
      })),
      recap,
      twilioSid: firstSid,
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
