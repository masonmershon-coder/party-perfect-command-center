import { getTwilioPublicStatus } from "@/lib/twilio";
import { isVercelRuntime } from "@/lib/data-dir";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Lightweight health check for hosting / uptime monitors */
export async function GET() {
  const twilio = getTwilioPublicStatus();

  return NextResponse.json({
    ok: true,
    service: "party-perfect-command-center",
    company: "Party Perfect Event Rentals",
    location: "Tulsa, Oklahoma",
    runtime: isVercelRuntime() ? "vercel" : "node",
    grokConfigured: Boolean(process.env.XAI_API_KEY?.trim()),
    twilioConfigured: twilio.configured,
    managerPhone: twilio.toDisplay,
    checkedAt: new Date().toISOString(),
  });
}
