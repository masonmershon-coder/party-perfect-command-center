import { timePrivateJson } from "@/lib/time/auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeEmployeeError, requireTimeEmployee } from "@/lib/time/http";

export async function GET(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  const store = await getTimeStore();
  const punches = await store.listPunches(employee.id);
  const shifts = await store.listShifts(employee.id);
  return timePrivateJson({ punches, shifts });
}
