import { requireApiAuth, isAuthError, privateJson } from "@/lib/api-auth";
import { upsertBudget } from "@/lib/ai-cost";
import { getAiCostEngine } from "@/lib/ai-cost-deps";

export async function GET() {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  const budgets = await getAiCostEngine().store.listBudgets();
  return privateJson({ budgets, note: "No default Mason budget invented." });
}

export async function PUT(request: Request) {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || typeof body.amountUsd !== "number") {
    return privateJson({ error: "id and amountUsd required" }, { status: 400 });
  }
  if (body.amountUsd < 0 || !Number.isFinite(body.amountUsd)) {
    return privateJson({ error: "invalid amount" }, { status: 400 });
  }
  const row = await upsertBudget(getAiCostEngine(), {
    id: body.id,
    scope: body.scope === "provider" || body.scope === "daily_metered" ? body.scope : "overall",
    providerId: typeof body.providerId === "string" ? body.providerId : null,
    amountUsd: body.amountUsd,
    period: body.period === "day" ? "day" : "month",
    updatedBy: gate.role,
  });
  return privateJson({ budget: row });
}
