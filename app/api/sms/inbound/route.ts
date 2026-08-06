import {
  emptyTwiml,
  handleMikeInboundSms,
  isAuthorizedSender,
  twimlMessage,
  validateTwilioSignature,
} from "@/lib/mike-sms";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function formToParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}

function requestUrl(request: Request) {
  // Prefer the public HTTPS URL Twilio used (behind Vercel proxies).
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    "partyperfect.app";
  const { pathname } = new URL(request.url);
  return `${proto}://${host}${pathname}`;
}

/**
 * Twilio Messaging webhook — Josh/owners text Mike's Twilio number.
 * Prefer:
 *   https://partyperfect.app/api/sms/inbound
 * Legacy hosts still accept /api (middleware does not redirect APIs).
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const params = formToParams(form);
    const from = params.From?.trim() || "";
    const body = params.Body?.trim() || "";
    const signature = request.headers.get("x-twilio-signature");

    const skipSig =
      process.env.TWILIO_SKIP_SIGNATURE_CHECK === "1" &&
      process.env.NODE_ENV !== "production";

    if (
      !skipSig &&
      !validateTwilioSignature({
        url: requestUrl(request),
        params,
        signature,
      })
    ) {
      return new NextResponse("Invalid signature", { status: 403 });
    }

    if (!from || !isAuthorizedSender(from)) {
      // Silently ignore unknowns so random texts don't burn Grok/Twilio.
      return new NextResponse(emptyTwiml(), {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }

    const reply = await handleMikeInboundSms(body);
    return new NextResponse(twimlMessage(reply), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  } catch (error) {
    console.error(
      "[sms/inbound]",
      error instanceof Error ? error.message : error,
    );
    return new NextResponse(
      twimlMessage(
        "Mike hit a snag processing that. Try again in a minute, or text HELP.",
      ),
      {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/sms/inbound",
    usage:
      "Configure Twilio phone number Messaging webhook (POST) to this URL. Only MANAGER_PHONE can chat with Mike.",
  });
}
