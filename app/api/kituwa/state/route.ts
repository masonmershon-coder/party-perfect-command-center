import { isKituwaAuthError, kituwaPrivateJson, requireKituwaSession } from "@/lib/kituwa/auth";
import { kituwaBrainHealth } from "@/lib/kituwa/health";
import { loadKituwaState } from "@/lib/kituwa/store";
import { liveStations } from "@/lib/kituwa/talk";

export async function GET(request: Request) {
  const gate = requireKituwaSession(request);
  if (isKituwaAuthError(gate)) return gate;
  const state = await loadKituwaState();
  return kituwaPrivateJson({
    ok: true,
    state,
    stations: liveStations(state),
    health: kituwaBrainHealth(state),
  });
}
