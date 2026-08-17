import {
  clearTimePinFailures,
  recordTimePinFailure,
  timePinAllowed,
} from "@/lib/time/rate-limit";
import {
  buildTimeSession,
  timePrivateJson,
  timeSessionFromRequest,
  trustedDeviceTokenFromRequest,
} from "@/lib/time/auth";
import { resolveTrustedDevice } from "@/lib/time/device";
import { getTimeStore } from "@/lib/time/deps";
import { loadTimeEmployee, mePayloadFor, renewTrustedAuthCookies } from "@/lib/time/http";
import { trustedClientIp } from "@/lib/time/network";
import { isEmployeePinShape, verifyTimePin } from "@/lib/time/pin";
import { timePreviewPublicMeta } from "@/lib/time/preview";
import { runOpenShiftSafetySweep } from "@/lib/time/safety-close";
import { notifySecurityOversight } from "@/lib/time/workflow";
import type { TimeEmployee } from "@/lib/time/types";

function isKiosk(request: Request, bodyMode?: string): boolean {
  const header = (request.headers.get("x-pp-time-mode") || "").toLowerCase();
  const q = new URL(request.url).searchParams.get("mode");
  return header === "kiosk" || q === "kiosk" || bodyMode === "kiosk";
}

/** Verify PIN against name candidates without leaking which name matched. */
async function authenticateByName(
  store: Awaited<ReturnType<typeof getTimeStore>>,
  firstName: string,
  lastName: string,
  pin: string,
): Promise<TimeEmployee | null> {
  const candidates = await store.findEmployeesByName(firstName, lastName);
  if (candidates.length === 0) return null;
  const matches = candidates.filter((e) => verifyTimePin(pin, e.pinHash));
  if (matches.length === 1) return matches[0];
  // Duplicate names with same PIN is pathological — refuse rather than guess.
  if (matches.length > 1) return null;
  return null;
}

export async function GET(request: Request) {
  const preview = timePreviewPublicMeta();
  const kiosk = isKiosk(request);
  const store = await getTimeStore();
  await runOpenShiftSafetySweep(store);

  let session = timeSessionFromRequest(request);
  if (!session && !kiosk) {
    const deviceTok = trustedDeviceTokenFromRequest(request);
    if (deviceTok) {
      const device = await store.getTrustedDevice(deviceTok.deviceId);
      if (
        device &&
        device.active &&
        !device.revokedAt &&
        device.employeeId === deviceTok.employeeId
      ) {
        const employee = await loadTimeEmployee(device.employeeId);
        if (employee && employee.active) {
          const deviceRes = await resolveTrustedDevice(store, {
            employeeId: employee.id,
            existingToken: deviceTok,
            userAgent: request.headers.get("user-agent"),
          });
          const nextSession = buildTimeSession(employee);
          return timePrivateJson(
            {
              authenticated: true,
              remembered: true,
              me: await mePayloadFor(employee),
              ...preview,
            },
            {
              session: nextSession,
              device: deviceRes.token,
            },
          );
        }
      }
    }
  }

  if (!session) return timePrivateJson({ authenticated: false, ...preview });
  const employee = await loadTimeEmployee(session.employeeId);
  if (!employee || !employee.active) {
    return timePrivateJson({ authenticated: false, ...preview }, { clear: true, clearDevice: true });
  }
  if ((session.cv ?? 0) !== (employee.credentialsVersion ?? 0)) {
    return timePrivateJson(
      { authenticated: false, reason: "credentials_rotated", ...preview },
      { clear: true, clearDevice: true },
    );
  }
  const auth = await renewTrustedAuthCookies(request, employee);
  return timePrivateJson(
    {
      authenticated: true,
      me: await mePayloadFor(employee),
      ...preview,
    },
    { session: auth.session, device: auth.device || undefined },
  );
}

export async function POST(request: Request) {
  let body: {
    firstName?: string;
    lastName?: string;
    pin?: string;
    mode?: string;
    /** @deprecated Employee number login removed from employee UX. */
    login?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return timePrivateJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const pin = String(body.pin || "").trim();
  const kiosk = isKiosk(request, body.mode);

  if (!firstName || !lastName || !isEmployeePinShape(pin)) {
    return timePrivateJson(
      { error: "Enter your first name, last name, and 4-digit PIN." },
      { status: 400 },
    );
  }

  const net = trustedClientIp(request);
  const deviceTok = trustedDeviceTokenFromRequest(request);
  const ipKey = `ip:${net.ip || "unknown"}`;
  const nameKey = `name:${firstName.toLowerCase()}:${lastName.toLowerCase()}`;
  const deviceKey = `device:${deviceTok?.deviceId || (kiosk ? "kiosk" : "new")}`;

  if (!(await timePinAllowed(ipKey)) || !(await timePinAllowed(nameKey)) || !(await timePinAllowed(deviceKey))) {
    return timePrivateJson(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const store = await getTimeStore();
  const employee = await authenticateByName(store, firstName, lastName, pin);
  if (!employee) {
    await recordTimePinFailure(ipKey);
    await recordTimePinFailure(nameKey);
    await recordTimePinFailure(deviceKey);
    await store.appendAudit({
      at: new Date().toISOString(),
      actor: "anonymous",
      action: "auth.failed",
      target: nameKey,
      detail: kiosk ? "kiosk" : "personal",
    });
    const recentFailures = (await store.listAudit()).filter(
      (entry) =>
        entry.action === "auth.failed" &&
        entry.target === nameKey &&
        Date.parse(entry.at) >= Date.now() - 30 * 60 * 1000,
    ).length;
    if (recentFailures === 5) {
      await notifySecurityOversight(store, {
        punchId: `auth:${nameKey}`,
        severity: "HIGH",
        summary: `HIGH · repeated failed PIN authentication (${recentFailures} attempts in 30 minutes)`,
      });
    }
    return timePrivateJson({ error: "That name and PIN did not match." }, { status: 401 });
  }

  await clearTimePinFailures(ipKey);
  await clearTimePinFailures(nameKey);
  await clearTimePinFailures(deviceKey);
  await runOpenShiftSafetySweep(store);

  if (kiosk) {
    // Shared device: never bind personal trusted identity to the kiosk.
    return timePrivateJson(
      {
        authenticated: true,
        me: await mePayloadFor(employee),
        mode: "kiosk",
        device: { trusted: false, newDevice: false, kiosk: true },
        ...timePreviewPublicMeta(),
      },
      { session: buildTimeSession(employee), clearDevice: true },
    );
  }

  const deviceRes = await resolveTrustedDevice(store, {
    employeeId: employee.id,
    existingToken: deviceTok,
    userAgent: request.headers.get("user-agent"),
  });

  let nextEmployee = employee;
  if (employee.onboardingStatus !== "active") {
    nextEmployee = await store.upsertEmployee({
      ...employee,
      onboardingStatus: "active",
    });
  }

  await store.appendAudit({
    at: new Date().toISOString(),
    actor: employee.id,
    action: deviceRes.newDevice ? "auth.login_new_device" : "auth.login",
    target: deviceRes.device.id,
    detail: "personal",
  });

  return timePrivateJson(
    {
      authenticated: true,
      me: await mePayloadFor(nextEmployee),
      mode: "personal",
      device: { trusted: true, newDevice: deviceRes.newDevice, kiosk: false },
      ...timePreviewPublicMeta(),
    },
    { session: buildTimeSession(nextEmployee), device: deviceRes.token },
  );
}

export async function DELETE(request: Request) {
  const kiosk = isKiosk(request);
  let clearDevice = kiosk;
  try {
    const body = (await request.json()) as { clearDevice?: boolean };
    if (body.clearDevice === true) clearDevice = true;
  } catch {
    // empty body is fine — personal default keeps device unless requested
  }
  return timePrivateJson(
    { authenticated: false, ...timePreviewPublicMeta() },
    { clear: true, clearDevice },
  );
}
