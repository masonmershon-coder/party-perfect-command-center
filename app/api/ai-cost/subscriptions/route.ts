import { requireApiAuth, isAuthError, privateJson } from "@/lib/api-auth";
import { upsertSubscription } from "@/lib/ai-cost";
import { getAiCostEngine } from "@/lib/ai-cost-deps";

export async function GET() {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  const subscriptions = await getAiCostEngine().store.listSubscriptions();
  return privateJson({ subscriptions, observesOnly: true });
}

export async function POST(request: Request) {
  const gate = await requireApiAuth("ai_cost");
  if (isAuthError(gate)) return gate;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string") {
    return privateJson({ error: "id required" }, { status: 400 });
  }
  const engine = getAiCostEngine();
  const row = await upsertSubscription(
    engine,
    {
      id: body.id,
      providerId: typeof body.providerId === "string" ? body.providerId : undefined,
      plan: typeof body.plan === "string" ? body.plan : undefined,
      amount: body.amount == null ? null : Number(body.amount),
      cadence: typeof body.cadence === "string" ? (body.cadence as never) : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      purpose: typeof body.purpose === "string" ? body.purpose : undefined,
      accountOwner: typeof body.accountOwner === "string" ? body.accountOwner : undefined,
      verificationStatus: typeof body.verificationStatus === "string" ? (body.verificationStatus as never) : undefined,
      kind: typeof body.kind === "string" ? (body.kind as never) : undefined,
      domain: body.domain === "mershon_personal" ? "mershon_personal" : "party_perfect",
      partyPerfectAllocationPct:
        body.partyPerfectAllocationPct == null ? undefined : Number(body.partyPerfectAllocationPct),
      renewalDate: typeof body.renewalDate === "string" ? body.renewalDate : undefined,
      effectiveDate: typeof body.effectiveDate === "string" ? body.effectiveDate : undefined,
    },
    gate.role,
  );
  return privateJson({ subscription: row, observesOnly: true });
}
