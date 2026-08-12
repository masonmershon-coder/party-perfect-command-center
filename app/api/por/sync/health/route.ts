import { NO_STORE_HEADERS } from "@/lib/no-store";
import { getPorSyncHealth } from "@/lib/por-sync-health";
import { probeSupabaseReadOnly } from "@/lib/supabase-probe";
import { isAuthError, requireOwner } from "@/lib/server-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only: last successful ENTERPRISE push + last error per sync target. */
export async function GET() {
  const gate = await requireOwner();
  if (isAuthError(gate)) return gate;

  const [health, database] = await Promise.all([
    getPorSyncHealth(),
    probeSupabaseReadOnly(),
  ]);
  return NextResponse.json({ health, database }, { headers: NO_STORE_HEADERS });
}
