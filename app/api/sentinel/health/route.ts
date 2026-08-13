import { isAuthError, requireApiAuth } from "@/lib/api-auth";
import { readSentinelHealthCard } from "@/lib/sentinel-health";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Employee + owner: monitoring card only. Never fake HEALTHY. */
export async function GET() {
  const gate = await requireApiAuth("session");
  if (isAuthError(gate)) return gate;

  const card = await readSentinelHealthCard();
  if (gate.role === "owner") {
    return NextResponse.json(card, { headers: NO_STORE_HEADERS });
  }
  return NextResponse.json(
    {
      status: card.status,
      label: card.label,
      banner: card.banner,
      employeeSafe: true,
    },
    { headers: NO_STORE_HEADERS },
  );
}
