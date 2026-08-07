import { rememberQuoteMatch } from "@/lib/quote-match-memory";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** POST { term, sku, name?, createdBy? } — girl confirms Madison's SKU pick → learn. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      term?: string;
      sku?: string;
      name?: string;
      createdBy?: string;
    };
    const entry = await rememberQuoteMatch({
      term: String(body?.term || ""),
      sku: String(body?.sku || ""),
      name: String(body?.name || ""),
      createdBy: body?.createdBy,
    });
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
