import { NextResponse } from "next/server";
import { requireApiAuth, isAuthError, privateJson } from "@/lib/api-auth";
import { exportCsv } from "@/lib/ai-cost";
import { getAiCostEngine } from "@/lib/ai-cost-deps";
import { NO_STORE_HEADERS } from "@/lib/no-store";

export async function GET() {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  try {
    const csv = await exportCsv(getAiCostEngine());
    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="ai-cost-usage.csv"',
      },
    });
  } catch {
    return privateJson({ error: "export_blocked" }, { status: 500 });
  }
}
