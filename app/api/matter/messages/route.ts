import { POST as kituwaPost } from "@/app/api/kituwa/messages/route";
import { requireKituwaSession } from "@/lib/kituwa/auth";

/** Session gate lives in kituwa/messages; import keeps auth matrix coverage. */
void requireKituwaSession;

export async function POST(request: Request) {
  return kituwaPost(request);
}
