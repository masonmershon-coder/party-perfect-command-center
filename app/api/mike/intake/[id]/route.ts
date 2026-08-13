import { intakeStatus } from "@/lib/mike-intake";
import { productionIntakeDeps } from "@/lib/mike-intake-deps";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET /api/mike/intake/[id] — STATUS for the authenticated sender only. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const result = await intakeStatus(request, id, productionIntakeDeps());
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
}
