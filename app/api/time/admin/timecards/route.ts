import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import { adminPunchDetail, publicEmployee, shellyOpsPunchView } from "@/lib/time/serialize";

/**
 * Timecards for cleanup / payroll.
 * Default punch view is ops-safe (no IP/risk scores).
 * Pass ?evidence=full for Mason/Michelle security inspection.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId") || undefined;
  const fullEvidence = url.searchParams.get("evidence") === "full";
  const gate = await requireTimeAdmin(request, fullEvidence ? "security" : "review");
  if (isTimeAdminError(gate)) return gate;
  const store = await getTimeStore();
  const employees = await store.listEmployees();
  const raw = await store.listPunches(employeeId);
  const punches = fullEvidence ? raw.map(adminPunchDetail) : raw.map(shellyOpsPunchView);
  const shifts = await store.listShifts(employeeId);
  return privateJson({
    employees: employees.map(publicEmployee),
    punches,
    shifts,
    evidence: fullEvidence ? "full" : "ops",
    note: fullEvidence
      ? "Full GPS/IP/device evidence — Mason/Michelle security oversight"
      : "Ops-safe punch list (no raw security telemetry). Use ?evidence=full for security inspection.",
  });
}
