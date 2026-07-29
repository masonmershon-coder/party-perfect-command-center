import { getAppVersionPayload } from "@/lib/app-version";
import { getTwilioPublicStatus } from "@/lib/twilio";
import { isVercelRuntime } from "@/lib/data-dir";
import { durableStoreMode } from "@/lib/durable-json";
import { isMetaLiveConfigured } from "@/lib/meta-graph";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TF_VERIFICATION_SID = "HH7b3fc2739ae07623793171028590a06c";
const A2P_MESSAGING_SERVICE_SID = "MG74887542ec9a90cb15616b46571913cd";
const A2P_CAMPAIGN_SID = "QE2c6890da8086d771620e9b13fadeba0b";

async function fetchTwilioCompliance() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}` };

  try {
    const [tfRes, a2pRes] = await Promise.all([
      fetch(
        `https://messaging.twilio.com/v1/Tollfree/Verifications/${TF_VERIFICATION_SID}`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `https://messaging.twilio.com/v1/Services/${A2P_MESSAGING_SERVICE_SID}/Compliance/Usa2p/${A2P_CAMPAIGN_SID}`,
        { headers, cache: "no-store" },
      ),
    ]);

    const tf = tfRes.ok ? await tfRes.json() : null;
    const a2p = a2pRes.ok ? await a2pRes.json() : null;

    return {
      tollFreeStatus: tf?.status ?? null,
      tollFreeUpdatedAt: tf?.date_updated ?? null,
      a2pCampaignStatus: a2p?.campaign_status ?? null,
      a2pUpdatedAt: a2p?.date_updated ?? null,
      a2pErrorCode: a2p?.errors?.[0]?.error_code ?? null,
      smsReady:
        tf?.status === "TWILIO_APPROVED" ||
        a2p?.campaign_status === "VERIFIED",
    };
  } catch {
    return null;
  }
}

/** Lightweight health check for hosting / uptime monitors */
export async function GET() {
  const twilio = getTwilioPublicStatus();
  const version = getAppVersionPayload();
  const compliance = await fetchTwilioCompliance();

  return NextResponse.json({
    ok: true,
    service: "party-perfect-command-center",
    company: "Party Perfect Event Rentals",
    location: "Tulsa, Oklahoma",
    runtime: isVercelRuntime() ? "vercel" : "node",
    durableStoreMode: durableStoreMode(),
    version: version.version,
    releasedAt: version.releasedAt,
    versionLabel: version.label,
    grokConfigured: Boolean(process.env.XAI_API_KEY?.trim()),
    twilioConfigured: twilio.configured,
    twilioFrom: twilio.fromDisplay,
    twilioCompliance: compliance,
    metaConfigured: await isMetaLiveConfigured(),
    madisonLive: await isMetaLiveConfigured(),
    managerPhone: twilio.toDisplay,
    checkedAt: new Date().toISOString(),
  });
}
