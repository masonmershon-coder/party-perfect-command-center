import { isAuthError, readSession, requireSession } from "@/lib/server-auth";
import { getContract } from "@/lib/por-crm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/por/contract?cntr=
 * Session required. Contract + line items + linked payments (no card fields).
 */
export async function GET(request: Request) {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;

  const session = await readSession();
  const includeFinancials = session?.role === "owner";
  const cntr = new URL(request.url).searchParams.get("cntr")?.trim() || "";
  if (!cntr) {
    return NextResponse.json({ error: "cntr is required." }, { status: 400 });
  }

  try {
    const contract = await getContract(cntr, { includeFinancials });
    if (!contract) {
      return NextResponse.json({ error: "Contract not found." }, { status: 404 });
    }
    return NextResponse.json({ contract });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Contract lookup failed.",
      },
      { status: 500 },
    );
  }
}
