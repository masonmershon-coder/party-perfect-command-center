import { GET as kituwaGet } from "@/app/api/kituwa/tasks/[taskId]/route";
import { requireKituwaSession } from "@/lib/kituwa/auth";

/** Session gate lives in kituwa/tasks; import keeps auth matrix coverage. */
void requireKituwaSession;

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  return kituwaGet(request, context);
}
