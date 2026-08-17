import { isAuthError, privateJson, requireApiAuth } from "@/lib/api-auth";
import { verifyTimeMikeBearer } from "@/lib/time/auth";
import { getTimeStore } from "@/lib/time/deps";
import { buildMikeTimeStatus } from "@/lib/time/mike-status";

/** Read-only. No write methods on this prefix. */
export async function GET(request: Request) {
  const machine = verifyTimeMikeBearer(request.headers.get("authorization"));
  if (!machine) {
    const gate = await requireApiAuth("timekeeping");
    if (isAuthError(gate)) return gate;
  }
  const status = await buildMikeTimeStatus(await getTimeStore());
  return privateJson({
    ...status,
    principal: machine ? "mike" : "owner",
    machine,
  });
}
