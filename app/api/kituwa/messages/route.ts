import { isKituwaAuthError, kituwaPrivateJson, requireKituwaSession } from "@/lib/kituwa/auth";
import { submitMatterMessage } from "@/lib/matter/submit-message";

export async function POST(request: Request) {
  const gate = requireKituwaSession(request);
  if (isKituwaAuthError(gate)) return gate;
  if (!gate.caps.includes("task_create")) {
    return kituwaPrivateJson({ error: "Task creation is not permitted." }, { status: 403 });
  }
  let body: {
    client_message_id?: string;
    conversation_id?: string | null;
    text?: string;
    attachments?: Array<{ id: string; name: string; mime: string }>;
    source?: string;
    client_created_at?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  try {
    const { ack, task } = await submitMatterMessage({
      client_message_id: String(body.client_message_id || ""),
      conversation_id: body.conversation_id ?? null,
      text: String(body.text || ""),
      attachments: body.attachments || [],
      source: body.source || "kituwa_web",
      client_created_at: body.client_created_at || new Date().toISOString(),
    });
    return kituwaPrivateJson({ ...ack, task });
  } catch (err) {
    return kituwaPrivateJson(
      { error: err instanceof Error ? err.message : "Message failed" },
      { status: 400 },
    );
  }
}
