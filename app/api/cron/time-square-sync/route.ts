import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getTimeStore } from "@/lib/time/deps";
import { runSquareShadowSync } from "@/lib/time/shadow-sync";
import { NO_STORE_HEADERS } from "@/lib/no-store";

/**
 * Hourly Shadow Mode sync — Bearer CRON_SECRET.
 * Square → PP Time only. No LLM. No Square writes.
 */
export async function GET(request: Request) {
  const expected = (process.env.CRON_SECRET || "").trim();
  const header = request.headers.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!expected || !presented) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const result = await runSquareShadowSync(await getTimeStore());
  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
}
