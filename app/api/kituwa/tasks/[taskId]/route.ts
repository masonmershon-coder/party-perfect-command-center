import { isKituwaAuthError, kituwaPrivateJson, requireKituwaSession } from "@/lib/kituwa/auth";
import { loadMatterRecords } from "@/lib/matter/records-store";

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const gate = requireKituwaSession(request);
  if (isKituwaAuthError(gate)) return gate;
  const { taskId } = await context.params;
  const store = await loadMatterRecords();
  const task = store.tasks[taskId];
  if (!task) return kituwaPrivateJson({ error: "Not found" }, { status: 404 });
  const message = store.messages[task.message_id] || null;
  const project = task.project_id ? store.projects[task.project_id] || null : null;
  const subtasks = task.subtask_ids.map((id) => store.tasks[id]).filter(Boolean);
  return kituwaPrivateJson({ ok: true, task, message, project, subtasks });
}
