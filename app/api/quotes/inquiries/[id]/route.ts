import { isAuthError, requireSession } from "@/lib/server-auth";
import {
  updateWebQuoteInquiryStatus,
  type WebQuoteInquiryStatus,
} from "@/lib/web-quote-inquiry";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireSession();
  if (isAuthError(gate)) return gate;
  const { id } = await context.params;
  let body: { status?: WebQuoteInquiryStatus } = {};
  try {
    body = (await request.json()) as { status?: WebQuoteInquiryStatus };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const status = body.status;
  if (status !== "new" && status !== "open" && status !== "handled") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  const inquiry = await updateWebQuoteInquiryStatus(id, status);
  if (!inquiry) {
    return NextResponse.json({ error: "Inquiry not found." }, { status: 404 });
  }
  return NextResponse.json({ inquiry });
}
