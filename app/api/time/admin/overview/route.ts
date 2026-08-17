import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import { buildMikeTimeStatus } from "@/lib/time/mike-status";
import { listExceptions } from "@/lib/time/punch";
import { publicEmployee } from "@/lib/time/serialize";
import { buildSecurityAlertQueue, buildShellyReviewQueue } from "@/lib/time/workflow";

export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "overview");
  if (isTimeAdminError(gate)) return gate;
  const store = await getTimeStore();
  const status = await buildMikeTimeStatus(store);
  const shelly = await buildShellyReviewQueue(store);
  const security = await buildSecurityAlertQueue(store);
  return privateJson({
    whoIsWorking: status.whoIsWorking,
    exceptions: await listExceptions(store),
    employees: (await store.listEmployees()).map(publicEmployee),
    punchReady: status.punchReady,
    payrollReady: status.payrollReady,
    shellyQueueOpen: shelly.open.length,
    shellyAwaitingClarification: shelly.awaitingClarification.length,
    ...(gate.canSecurity
      ? {
          securityAlertsOpen: security.open.length,
          securityAlertsHigh: security.high.length,
        }
      : {}),
    flow: "EMPLOYEE → SHELLY CLEANUP → MICHELLE FINAL PAYROLL → PAYCHEX",
    roles: {
      shelly: "Timekeeping cleanup (ops only — no raw security telemetry)",
      mason: "Primary security / time-theft oversight",
      michelle: "Owner — full ops + security + payroll authority",
    },
    access: {
      review:
        gate.canOwner ||
        gate.capabilities.includes("timekeeping.review") ||
        gate.capabilities.includes("timekeeping.admin"),
      employees:
        gate.canOwner ||
        gate.capabilities.includes("timekeeping.employees") ||
        gate.capabilities.includes("timekeeping.admin"),
      payroll:
        gate.canOwner ||
        gate.capabilities.includes("timekeeping.payroll") ||
        gate.capabilities.includes("timekeeping.admin"),
      security: gate.canSecurity,
      owner: gate.canOwner,
    },
    note: "Punches allowed off-site. GPS/IP/device evidence captured for Mason/Michelle. Shelly sees cleanup queue only.",
  });
}
