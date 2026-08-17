import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import {
  runSquareShadowSync,
  shadowSyncStatusPayload,
} from "@/lib/time/shadow-sync";

/** Shelly/Mason/Michelle — Square Shadow Mode sync status + manual run. */
export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "review");
  if (isTimeAdminError(gate)) return gate;
  const settings = await (await getTimeStore()).getSettings();
  return privateJson(shadowSyncStatusPayload(settings));
}

export async function POST(request: Request) {
  const gate = await requireTimeAdmin(request, "review");
  if (isTimeAdminError(gate)) return gate;
  let body: { action?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (body.action === "run") {
    const result = await runSquareShadowSync(await getTimeStore());
    return privateJson(result);
  }
  return privateJson({ error: "Unknown action. Use { action: \"run\" }." }, { status: 400 });
}
