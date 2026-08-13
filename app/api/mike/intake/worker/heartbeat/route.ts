import { workerHeartbeat } from "@/lib/mike-intake";
import { productionIntakeDeps } from "@/lib/mike-intake-deps";
import { NO_STORE_HEADERS } from "@/lib/no-store";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await workerHeartbeat(request, productionIntakeDeps());
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
}
