import { requireApiAuth, isAuthError, privateJson } from "@/lib/api-auth";
import { acknowledgeAlert } from "@/lib/ai-cost";
import { getAiCostEngine } from "@/lib/ai-cost-deps";

export async function GET() {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  const alerts = await getAiCostEngine().store.listAlerts();
  return privateJson({ alerts });
}

export async function PATCH(request: Request) {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  const body = (await request.json().catch(() => null)) as { id?: string; action?: string } | null;
  if (!body?.id || (body.action !== "acknowledge" && body.action !== "resolve")) {
    return privateJson({ error: "id and action required" }, { status: 400 });
  }
  const row = await acknowledgeAlert(getAiCostEngine(), body.id, gate.role, body.action);
  if (!row) return privateJson({ error: "not_found" }, { status: 404 });
  return privateJson({ alert: row });
}
