import {
  isAuthError,
  privateJson,
  requireApiAuth,
} from "@/lib/api-auth";
import { madisonMediaToolsStatus } from "@/lib/madison-media-tools";

export const runtime = "nodejs";

/** Madison scans which photo/video engines she can use right now. */
export async function GET() {
  const gate = await requireApiAuth("design");
  if (isAuthError(gate)) return gate;

  return privateJson({
    success: true,
    ...madisonMediaToolsStatus(),
  });
}
