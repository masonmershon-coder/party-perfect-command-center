import { isKituwaAuthError, kituwaPrivateJson, requireKituwaSession } from "@/lib/kituwa/auth";
import { loadMatterRecords } from "@/lib/matter/records-store";

export async function GET(request: Request) {
  const gate = requireKituwaSession(request);
  if (isKituwaAuthError(gate)) return gate;
  const store = await loadMatterRecords();
  const tasks = Object.values(store.tasks).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return kituwaPrivateJson({ ok: true, tasks });
}
