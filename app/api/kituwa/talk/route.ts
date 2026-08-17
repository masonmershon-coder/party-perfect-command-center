import { isKituwaAuthError, kituwaPrivateJson, requireKituwaSession } from "@/lib/kituwa/auth";
import { kituwaBrainHealth } from "@/lib/kituwa/health";
import { liveStations, handleTalk } from "@/lib/kituwa/talk";

export async function POST(request: Request) {
  const gate = requireKituwaSession(request);
  if (isKituwaAuthError(gate)) return gate;
  let body: { text?: string; source?: "text" | "voice" | "attachment" } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const text = String(body.text || "").trim();
  if (!text) return kituwaPrivateJson({ error: "Say or type what you need." }, { status: 400 });
  if (!gate.caps.includes("task_create")) {
    return kituwaPrivateJson({ error: "Task creation is not permitted." }, { status: 403 });
  }
  try {
    const state = await handleTalk({
      text,
      source: body.source === "voice" || body.source === "attachment" ? body.source : "text",
    });
    return kituwaPrivateJson({
      ok: true,
      state,
      stations: liveStations(state),
      health: kituwaBrainHealth(state),
    });
  } catch (err) {
    return kituwaPrivateJson(
      { error: err instanceof Error ? err.message : "Talk failed" },
      { status: 500 },
    );
  }
}
