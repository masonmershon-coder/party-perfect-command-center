import { madisonMediaToolsStatus } from "@/lib/madison-media-tools";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Madison scans which photo/video engines she can use right now. */
export async function GET() {
  return NextResponse.json({
    success: true,
    ...madisonMediaToolsStatus(),
  });
}
