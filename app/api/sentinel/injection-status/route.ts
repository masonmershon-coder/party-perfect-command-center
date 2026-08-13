import { isAuthError, requireApiAuth } from "@/lib/api-auth";
import { injectionSignalTotals } from "@/lib/sentinel-inbox";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Owner: signal counts only. Never matched text. */
export async function GET() {
  const gate = await requireApiAuth("security");
  if (isAuthError(gate)) return gate;

  const totals = await injectionSignalTotals();
  return NextResponse.json(
    {
      events: totals.events,
      signalCount: totals.signalCount,
      byId: totals.byId,
    },
    { headers: NO_STORE_HEADERS },
  );
}
