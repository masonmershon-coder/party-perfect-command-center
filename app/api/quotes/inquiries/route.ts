import { isAuthError, requireSession } from "@/lib/server-auth";
import { listWebQuoteInquiries } from "@/lib/web-quote-inquiry";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Showroom: website inquiries (no rates). Does not touch saved POR quote queue. */
export async function GET() {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;
  const inquiries = await listWebQuoteInquiries();
  return NextResponse.json({ inquiries });
}
