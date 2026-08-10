import { isAuthError, requireSession } from "@/lib/server-auth";
import { getDashboardStats } from "@/lib/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;

  const stats = await getDashboardStats();
  // Strip money-sensitive POR fields for employees.
  if (gate.role !== "owner" && stats.por) {
    return NextResponse.json({
      stats: {
        ...stats,
        bookkeepingPending: 0,
        por: {
          ...stats.por,
          arOpenBalance: null,
          paymentsLast24hVolume: null,
        },
      },
    });
  }
  return NextResponse.json({ stats });
}
