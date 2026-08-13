import { isAuthError, requireApiAuth } from "@/lib/api-auth";
import { getSentinelInboxEvent } from "@/lib/sentinel-inbox";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Owner drilldown — redacted fields only. Read-only. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireApiAuth("security");
  if (isAuthError(gate)) return gate;

  const { id } = await context.params;
  const event = await getSentinelInboxEvent(id);
  if (!event) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json({ event }, { headers: NO_STORE_HEADERS });
}
