import { getDashboardStats } from "@/lib/storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const stats = await getDashboardStats();
  return NextResponse.json({ stats });
}
