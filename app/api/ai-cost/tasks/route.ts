import { requireApiAuth, isAuthError, privateJson } from "@/lib/api-auth";
import { buildTaskRows } from "@/lib/ai-cost";
import { getAiCostEngine } from "@/lib/ai-cost-deps";

export async function GET(request: Request) {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");
  const tasks = await buildTaskRows(
    getAiCostEngine(),
    domain === "mershon_personal" || domain === "party_perfect" ? domain : undefined,
  );
  return privateJson({ tasks });
}
