import { isAuthError, readSession, requireSession } from "@/lib/server-auth";
import { getContractBalance, getCustomerBalances } from "@/lib/por-crm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/por/balance?cntr= | ?cnum=
 * Owner session required for dollar detail.
 */
export async function GET(request: Request) {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;

  const session = await readSession();
  const includeFinancials = session?.role === "owner";
  if (!includeFinancials) {
    return NextResponse.json(
      { error: "Owner access required for contract balances." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const cntr = url.searchParams.get("cntr")?.trim() || "";
  const cnum = url.searchParams.get("cnum")?.trim() || "";

  try {
    if (cntr) {
      const balance = await getContractBalance(cntr, { includeFinancials: true });
      if (!balance) {
        return NextResponse.json({ error: "Contract not found." }, { status: 404 });
      }
      return NextResponse.json({ balance });
    }
    if (cnum) {
      const balances = await getCustomerBalances(cnum, {
        includeFinancials: true,
        openOnly: url.searchParams.get("openOnly") !== "0",
      });
      if (!balances) {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
      return NextResponse.json({ balances });
    }
    return NextResponse.json(
      { error: "Provide cntr= or cnum=." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Balance lookup failed.",
      },
      { status: 500 },
    );
  }
}
