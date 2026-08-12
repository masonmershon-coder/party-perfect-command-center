import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { rememberQuoteMatch } from "@/lib/quote-match-memory";

export const runtime = "nodejs";

/** POST { term, sku, name?, createdBy? } — girl confirms Madison's SKU pick → learn. */
export async function POST(request: Request) {
  const gate = await requireApiAuth("quoting");
  if (isAuthError(gate)) return gate;

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
    return privateJson({ entry });
  } catch (err) {
    return privateJson(
      { error: (err as Error).message },
      { status: 400 },
    );
  }
}
