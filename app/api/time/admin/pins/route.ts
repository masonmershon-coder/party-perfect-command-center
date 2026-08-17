import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import {
  hasPinConfigured,
  isProtectedOwnerEmployee,
  revokeAllTrustedDevices,
} from "@/lib/time/employee-admin";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import { hashTimePin, isEmployeePinShape } from "@/lib/time/pin";

type PinEntry = {
  employeeId?: string;
  pin?: string;
};

function canManageProtected(
  gate: Awaited<ReturnType<typeof requireTimeAdmin>>,
): boolean {
  if (isTimeAdminError(gate)) return false;
  return (
    gate.canOwner ||
    gate.kind === "command_center" ||
    gate.capabilities.includes("timekeeping.admin")
  );
}

export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "employees");
  if (isTimeAdminError(gate)) return gate;

  const store = await getTimeStore();
  const employees = (await store.listEmployees())
    .map((employee) => ({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      department: employee.department,
      active: employee.active,
      protected: isProtectedOwnerEmployee(employee),
      pinStatus: hasPinConfigured(employee) ? "CONFIGURED" : "NOT CONFIGURED",
    }))
    .sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
    );

  return privateJson({
    employees,
    configured: employees.filter((employee) => employee.pinStatus === "CONFIGURED").length,
    remaining: employees.filter((employee) => employee.pinStatus === "NOT CONFIGURED").length,
    canManageProtected: canManageProtected(gate),
  });
}

export async function POST(request: Request) {
  const gate = await requireTimeAdmin(request, "employees");
  if (isTimeAdminError(gate)) return gate;

  let body: { entries?: PinEntry[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length || entries.length > 200) {
    return privateJson(
      { error: "Enter between 1 and 200 employee PINs." },
      { status: 400 },
    );
  }

  const ids = entries.map((entry) => String(entry.employeeId || "").trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    return privateJson(
      { error: "Each employee may appear only once in a batch." },
      { status: 400 },
    );
  }
  if (entries.some((entry) => !isEmployeePinShape(String(entry.pin || "").trim()))) {
    return privateJson(
      { error: "Every PIN must be exactly 4 digits." },
      { status: 400 },
    );
  }

  const store = await getTimeStore();
  const allowProtected = canManageProtected(gate);
  const employees = new Map(
    await Promise.all(
      ids.map(async (id) => [id, await store.getEmployee(id)] as const),
    ),
  );

  for (const id of ids) {
    const employee = employees.get(id);
    if (!employee) {
      return privateJson({ error: "An employee no longer exists." }, { status: 409 });
    }
    if (isProtectedOwnerEmployee(employee) && !allowProtected) {
      return privateJson(
        { error: "Owner/security PINs require Mason or Michelle." },
        { status: 403 },
      );
    }
  }

  const now = new Date().toISOString();
  const errors: { employeeId: string; error: string }[] = [];
  let savedCount = 0;

  for (const entry of entries) {
    const employeeId = String(entry.employeeId);
    const employee = employees.get(employeeId)!;
    try {
      // Plaintext exists only in this request scope and is immediately hashed.
      const pinHash = hashTimePin(String(entry.pin).trim());
      const credentialsVersion = (employee.credentialsVersion ?? 0) + 1;
      const revoked = await revokeAllTrustedDevices(
        await store.listTrustedDevices(employee.id),
        (device) => store.upsertTrustedDevice(device),
        now,
      );
      await store.upsertEmployee({
        ...employee,
        pinHash,
        credentialsVersion,
        onboardingStatus:
          employee.onboardingStatus === "active"
            ? "login_configured"
            : employee.onboardingStatus,
        updatedAt: now,
      });
      await store.appendAudit({
        at: now,
        actor: gate.actor,
        action: "employee.pin_batch_set",
        target: employee.id,
        detail: `pin_configured=true;devices_revoked=${revoked};cv=${credentialsVersion}`,
      });
      savedCount += 1;
    } catch {
      errors.push({ employeeId, error: "Could not save PIN." });
    }
  }

  const roster = await store.listEmployees();
  const configured = roster.filter(hasPinConfigured).length;
  return privateJson({
    saved: savedCount,
    configured,
    remaining: roster.length - configured,
    errors,
  });
}
