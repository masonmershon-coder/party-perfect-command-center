import { timePrivateJson } from "@/lib/time/auth";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeEmployeeError, requireTimeEmployee } from "@/lib/time/http";

/**
 * Eligibility-driven. Ineligible employees get visible:false and empty banks.
 * Never show $0 balances or advertise the benefit in the employee UI.
 */
export async function GET(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  if (!employee.ptoEligible && !employee.vacationEligible) {
    return timePrivateJson({ visible: false, banks: [], transactions: [] });
  }
  const store = await getTimeStore();
  const banks = (await store.listLeaveBanks(employee.id)).filter((b) => {
    if (b.type === "pto") return employee.ptoEligible;
    if (b.type === "vacation") return employee.vacationEligible;
    return false;
  });
  if (banks.length === 0) {
    return timePrivateJson({ visible: false, banks: [], transactions: [] });
  }
  return timePrivateJson({
    visible: true,
    banks,
    transactions: await store.listLeaveTransactions(employee.id),
  });
}
