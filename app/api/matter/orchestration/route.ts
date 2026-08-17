import { requireApiAuth, isAuthError, privateJson } from "@/lib/api-auth";
import { loadMatterOrchestrationSnapshot } from "@/lib/matter-orchestration";

/** Owner-only Matter control-plane snapshot (real file persistence only). */
export async function GET() {
  const gate = await requireApiAuth("admin");
  if (isAuthError(gate)) return gate;
  const snap = loadMatterOrchestrationSnapshot();
  if (!snap.ok) {
    return privateJson({ error: snap.error, path: snap.path }, { status: 503 });
  }
  return privateJson(snap);
}
