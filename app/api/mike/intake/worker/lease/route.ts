import { workerLease } from "@/lib/mike-intake";
import { productionIntakeDeps } from "@/lib/mike-intake-deps";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** POST /api/mike/intake/worker/lease — Mac outbound worker only. */
export async function POST(request: Request) {
  const result = await workerLease(request, productionIntakeDeps());
  if (result.status === 204) {
    return new NextResponse(null, { status: 204, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
}
