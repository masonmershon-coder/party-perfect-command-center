import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { candidatesFromText } from "@/lib/quote-candidates";

/** POST { command, perItem? } -> { lines: [{ qty, term, candidates:[{sku,name,ratePerDay,category,available,score}] }] } */
export async function POST(req: Request) {
  const gate = await requireApiAuth("quoting");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await req.json()) as { command?: string; perItem?: number };
    const lines = await candidatesFromText(
      String(body?.command || ""),
      typeof body?.perItem === "number" ? body.perItem : 3,
    );
    return privateJson({ lines });
  } catch (err) {
    return privateJson({ error: (err as Error).message }, { status: 400 });
  }
}
