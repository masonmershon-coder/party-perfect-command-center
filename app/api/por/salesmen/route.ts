import { isAuthError, requireSession } from "@/lib/server-auth";
import { getPorSalesmen } from "@/lib/por-salesmen";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** POR Salesman picker. Empty until ENTERPRISE syncs the table. */
export async function GET() {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;
  const state = await getPorSalesmen();
  return NextResponse.json(state);
}
