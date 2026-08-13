import { appendSentinelAppEvent } from "./sentinel-inbox";
import { logLooksSafe } from "./mike-intake-policy";

export async function recordIntakeTelemetry(
  payload: Record<string, unknown>,
): Promise<void> {
  if (!logLooksSafe(payload)) return;
  try {
    await appendSentinelAppEvent({
      kind: "MIKE_INTAKE",
      severity: "WATCH",
      title: "Talk to Mike intake",
      summary: `${payload.state || "event"} ${payload.result_code || ""}`.trim(),
      outcome: String(payload.result_code || ""),
      role: String(payload.sender_id || ""),
    });
  } catch {
    // telemetry must never block intake
  }
}
