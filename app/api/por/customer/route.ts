import { isAuthError, readSession, requireSession } from "@/lib/server-auth";
import {
  getCustomerHistory,
  searchCustomers,
} from "@/lib/por-crm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/por/customer?q=name | ?cnum=123
 * Session required. PII internal only. Dollars when owner.
 */
export async function GET(request: Request) {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;

  const session = await readSession();
  const includeFinancials = session?.role === "owner";
  const url = new URL(request.url);
  const cnum = url.searchParams.get("cnum")?.trim() || "";
  const q = url.searchParams.get("q")?.trim() || "";

  try {
    if (cnum) {
      const history = await getCustomerHistory(cnum, {
        includeFinancials,
        maxContracts: 50,
      });
      if (!history) {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
      return NextResponse.json({ history });
    }
    if (!q) {
      return NextResponse.json(
        { error: "Provide q= or cnum=." },
        { status: 400 },
      );
    }
    const matches = await searchCustomers(q, {
      limit: 25,
      includeFinancials,
    });
    return NextResponse.json({ matches });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Customer lookup failed.",
      },
      { status: 500 },
    );
  }
}
