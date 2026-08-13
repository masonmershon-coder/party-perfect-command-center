import { requireApiAuth, isAuthError, privateJson } from "@/lib/api-auth";
import { buildExecutiveSummary } from "@/lib/ai-cost";
import { getAiCostEngine } from "@/lib/ai-cost-deps";

export async function GET() {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  const summary = await buildExecutiveSummary(getAiCostEngine());
  return privateJson(summary);
}
