import { isKituwaAuthError, kituwaPrivateJson, requireKituwaSession } from "@/lib/kituwa/auth";
import { loadKituwaState } from "@/lib/kituwa/store";

export async function GET(request: Request) {
  const gate = requireKituwaSession(request);
  if (isKituwaAuthError(gate)) return gate;
  const state = await loadKituwaState();
  return kituwaPrivateJson({ ok: true, sub: gate.sub, caps: gate.caps, matterStatus: state.matterStatus });
}
