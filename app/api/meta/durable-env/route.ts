import { getMetaDurableEnvExport } from "@/lib/meta-durable-env";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Owner helper: show which Meta env keys are ready to push to Vercel.
 * ?secrets=1 returns plaintext values for local copy / push script use.
 * Do not expose secrets=1 publicly without auth in production long-term.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeSecrets = searchParams.get("secrets") === "1";
  const payload = await getMetaDurableEnvExport(includeSecrets);
  return NextResponse.json(payload);
}
