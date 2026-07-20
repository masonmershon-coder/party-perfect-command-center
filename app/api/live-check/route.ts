import { buildLiveSnapshot } from "@/lib/live-snapshot";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = await buildLiveSnapshot();
  return NextResponse.json({ snapshot });
}
