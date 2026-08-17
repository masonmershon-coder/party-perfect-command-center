import {
  isTimeEmployeeError,
  mePayloadFor,
  renewTrustedAuthCookies,
  requireTimeEmployee,
} from "@/lib/time/http";
import { timePrivateJson } from "@/lib/time/auth";

export async function GET(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  const auth = await renewTrustedAuthCookies(request, employee);
  return timePrivateJson(await mePayloadFor(employee), {
    session: auth.session,
    device: auth.device || undefined,
  });
}
