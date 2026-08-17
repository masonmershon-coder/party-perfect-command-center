import { privateJson } from "@/lib/api-auth";
import { getTimeStore } from "@/lib/time/deps";
import {
  capsForShellyRole,
  createEmployeeRecord,
  isProtectedOwnerEmployee,
  parseShellyRole,
  revokeAllTrustedDevices,
  timeOnboardingUrl,
} from "@/lib/time/employee-admin";
import { isTimeAdminError, requireTimeAdmin } from "@/lib/time/http";
import { hashTimePin, isEmployeePinShape } from "@/lib/time/pin";
import { shellyEmployeeAdminView } from "@/lib/time/serialize";
import type { TimeEmployee } from "@/lib/time/types";

/**
 * Shelly employee + PIN administration.
 * Never returns plaintext PINs. Never grants Owner/security caps.
 * Deactivate preserves historical punches/corrections/audit.
 */
export async function GET(request: Request) {
  const gate = await requireTimeAdmin(request, "employees");
  if (isTimeAdminError(gate)) return gate;
  const store = await getTimeStore();
  const employees = await store.listEmployees();
  const rows = [];
  for (const e of employees) {
    const devices = await store.listTrustedDevices(e.id);
    rows.push(shellyEmployeeAdminView(e, devices));
  }
  rows.sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
  );
  return privateJson({
    employees: rows,
    onboardingUrl: timeOnboardingUrl(),
    note: "PIN values are never shown. Reset sets a new PIN. History is never deleted on deactivate.",
  });
}

export async function POST(request: Request) {
  const gate = await requireTimeAdmin(request, "employees");
  if (isTimeAdminError(gate)) return gate;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const created = createEmployeeRecord({
    firstName: String(body.firstName || ""),
    lastName: String(body.lastName || ""),
    department: String(body.department || ""),
    title: String(body.title || body.position || ""),
    pin: String(body.pin || ""),
    startDate: body.startDate != null ? String(body.startDate) : null,
    ptoEligible: Boolean(body.ptoEligible),
    vacationEligible: Boolean(body.vacationEligible),
    role: parseShellyRole(body.role),
    notes: body.notes != null ? String(body.notes) : "",
  });
  if (!created.ok) return privateJson({ error: created.error }, { status: 400 });

  const store = await getTimeStore();
  const row = await store.upsertEmployee(created.employee);
  const actor = gate.actor;
  await store.appendAudit({
    at: new Date().toISOString(),
    actor,
    action: "employee.create",
    target: row.id,
    detail: `${row.firstName} ${row.lastName}|${row.department}|pin_set=true`,
  });
  const devices = await store.listTrustedDevices(row.id);
  return privateJson({
    employee: shellyEmployeeAdminView(row, devices),
    onboardingUrl: timeOnboardingUrl(),
    workflow: [
      "Employee saved",
      "Share onboarding link / QR",
      "Employee installs Party Perfect Time",
      "Name + PIN login",
      "Personal phone becomes trusted device",
      "Ready to clock in",
    ],
  });
}

type PatchBody = {
  id?: string;
  action?:
    | "update"
    | "reset_pin"
    | "revoke_devices"
    | "restart_onboarding"
    | "deactivate"
    | "reactivate";
  firstName?: string;
  lastName?: string;
  department?: string;
  title?: string;
  startDate?: string | null;
  notes?: string;
  ptoEligible?: boolean;
  vacationEligible?: boolean;
  role?: string;
  pin?: string;
  active?: boolean;
};

export async function PATCH(request: Request) {
  const gate = await requireTimeAdmin(request, "employees");
  if (isTimeAdminError(gate)) return gate;
  let body: PatchBody = {};
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return privateJson({ error: "Missing id" }, { status: 400 });

  const store = await getTimeStore();
  const existing = await store.getEmployee(body.id);
  if (!existing) return privateJson({ error: "Not found" }, { status: 404 });

  const actor = gate.actor;
  const now = new Date().toISOString();
  const action = body.action || (body.pin ? "reset_pin" : body.active === false ? "deactivate" : "update");

  if (isProtectedOwnerEmployee(existing) && !gate.canOwner) {
    if (action === "deactivate" || action === "reset_pin" || action === "revoke_devices") {
      return privateJson(
        {
          error: "Protected owner/security account. Mason or Michelle must change this outside Shelly employee admin.",
        },
        { status: 403 },
      );
    }
    if (action === "update" && body.role) {
      return privateJson(
        { error: "Cannot change Owner / security role from Shelly employee admin." },
        { status: 403 },
      );
    }
  }

  let next: TimeEmployee = { ...existing };
  let auditAction = "employee.patch";
  let auditDetail = "";

  if (action === "reset_pin") {
    const pin = String(body.pin || "").trim();
    if (!isEmployeePinShape(pin)) {
      return privateJson({ error: "New PIN must be exactly 4 digits." }, { status: 400 });
    }
    next = {
      ...next,
      pinHash: hashTimePin(pin),
      credentialsVersion: (next.credentialsVersion ?? 0) + 1,
      onboardingStatus: next.onboardingStatus === "active" ? "login_configured" : next.onboardingStatus,
    };
    const revoked = await revokeAllTrustedDevices(
      await store.listTrustedDevices(next.id),
      (row) => store.upsertTrustedDevice(row),
      now,
    );
    auditAction = "employee.reset_pin";
    auditDetail = `pin_reset=true;devices_revoked=${revoked};cv=${next.credentialsVersion}`;
  } else if (action === "revoke_devices" || action === "restart_onboarding") {
    const revoked = await revokeAllTrustedDevices(
      await store.listTrustedDevices(next.id),
      (row) => store.upsertTrustedDevice(row),
      now,
    );
    next = {
      ...next,
      credentialsVersion: (next.credentialsVersion ?? 0) + 1,
      onboardingStatus: "invited",
    };
    auditAction =
      action === "restart_onboarding" ? "employee.restart_onboarding" : "employee.revoke_devices";
    auditDetail = `devices_revoked=${revoked};cv=${next.credentialsVersion}`;
  } else if (action === "deactivate") {
    const revoked = await revokeAllTrustedDevices(
      await store.listTrustedDevices(next.id),
      (row) => store.upsertTrustedDevice(row),
      now,
    );
    next = {
      ...next,
      active: false,
      credentialsVersion: (next.credentialsVersion ?? 0) + 1,
    };
    auditAction = "employee.deactivate";
    auditDetail = `history_preserved=true;devices_revoked=${revoked};cv=${next.credentialsVersion}`;
  } else if (action === "reactivate") {
    next = {
      ...next,
      active: true,
      onboardingStatus: "invited",
      credentialsVersion: (next.credentialsVersion ?? 0) + 1,
    };
    auditAction = "employee.reactivate";
    auditDetail = `cv=${next.credentialsVersion}`;
  } else {
    // update profile (no security caps)
    if (body.firstName != null) next.firstName = String(body.firstName).trim();
    if (body.lastName != null) next.lastName = String(body.lastName).trim();
    if (body.firstName != null || body.lastName != null) {
      next.preferredName = next.firstName;
    }
    if (body.department != null) next.department = String(body.department).trim();
    if (body.title != null) next.title = String(body.title).trim();
    if (body.startDate !== undefined) {
      next.startDate = body.startDate ? String(body.startDate).trim() : null;
    }
    if (body.notes != null) next.notes = String(body.notes).trim().slice(0, 4000);
    if (body.ptoEligible != null) next.ptoEligible = Boolean(body.ptoEligible);
    if (body.vacationEligible != null) next.vacationEligible = Boolean(body.vacationEligible);
    if (body.role != null && !isProtectedOwnerEmployee(existing)) {
      next.capabilities = capsForShellyRole(parseShellyRole(body.role));
    }
    if (body.pin) {
      return privateJson(
        { error: "Use action reset_pin to change a PIN (never returns the old PIN)." },
        { status: 400 },
      );
    }
    auditAction = "employee.update";
    auditDetail = `${next.firstName} ${next.lastName}|${next.department}`;
  }

  const saved = await store.upsertEmployee(next);
  await store.appendAudit({
    at: now,
    actor,
    action: auditAction,
    target: saved.id,
    detail: auditDetail,
  });
  const devices = await store.listTrustedDevices(saved.id);
  return privateJson({
    employee: shellyEmployeeAdminView(saved, devices),
    onboardingUrl: timeOnboardingUrl(),
  });
}
