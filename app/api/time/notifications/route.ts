import { timePrivateJson } from "@/lib/time/auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeEmployeeError, requireTimeEmployee } from "@/lib/time/http";

export async function GET(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  const notifications = await (await getTimeStore()).listNotifications(employee.id);
  return timePrivateJson({
    notifications,
    unreadCount: notifications.filter((n) => !n.readAt).length,
  });
}

export async function PATCH(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  let body: { id?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return timePrivateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return timePrivateJson({ error: "id required" }, { status: 400 });
  const saved = await (await getTimeStore()).markNotificationRead(body.id, employee.id);
  if (!saved) return timePrivateJson({ error: "Not found" }, { status: 404 });
  return timePrivateJson({ notification: saved });
}
