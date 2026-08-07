import { NextResponse } from "next/server";
import { candidatesFromText } from "@/lib/quote-candidates";

/** POST { command, perItem? } -> { lines: [{ qty, term, candidates:[{sku,name,ratePerDay,category,available,score}] }] } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { command?: string; perItem?: number };
    const lines = await candidatesFromText(
      String(body?.command || ""),
      typeof body?.perItem === "number" ? body.perItem : 3,
    );
    return NextResponse.json({ lines });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
