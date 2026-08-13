import { enforceWebQuoteInquiryRateLimits } from "@/lib/web-quote-inquiry-rate-limit";
import {
  createWebQuoteInquiry,
  validateWebQuoteInquiryInput,
} from "@/lib/web-quote-inquiry";
import { screenUntrusted } from "@/lib/matter-gateway";
import { recordInjectionSignals } from "@/lib/sentinel-telemetry";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Public customer quote / help / tent consultation intake. No rates invented. */
export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = validateWebQuoteInquiryInput(body);
  if (!parsed.ok) {
    if (parsed.spam) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const limited = await enforceWebQuoteInquiryRateLimits({
    ip: clientIp(request),
    phone: parsed.value.phone,
  });
  if (limited) {
    return NextResponse.json({ error: limited }, { status: 429 });
  }

  const injection = screenUntrusted(
    [parsed.value.notes, parsed.value.venue].filter(Boolean).join("\n"),
  );
  if (injection.flagged) {
    void recordInjectionSignals({
      surface: "get-quote.inquiry",
      signalCount: injection.signalCount,
      signalIds: injection.signalIds,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });
  }

  const inquiry = await createWebQuoteInquiry(parsed.value);
  return NextResponse.json({
    ok: true,
    id: inquiry.id,
    intent: inquiry.intent,
  });
}
