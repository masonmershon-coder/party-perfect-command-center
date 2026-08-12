import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { createAgent, listAgents } from "@/lib/storage";
import type { CreateAgentInput } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireApiAuth("agents");
  if (isAuthError(gate)) return gate;

  const agents = await listAgents();
  return privateJson({ agents });
}

export async function POST(request: Request) {
  const gate = await requireApiAuth("agents");
  if (isAuthError(gate)) return gate;

  try {
    const body = (await request.json()) as CreateAgentInput;

    if (!body.name?.trim() || !body.goal?.trim()) {
      return NextResponse.json(
        { error: "name and goal are required." },
        { status: 400 },
      );
    }

    const agent = await createAgent(body);
    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create agent.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
