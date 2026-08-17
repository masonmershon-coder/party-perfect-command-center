import {
  buildTimeSession,
  timePrivateJson,
  trustedDeviceTokenFromRequest,
} from "@/lib/time/auth";
import { resolveTrustedDevice } from "@/lib/time/device";
import { getTimeStore } from "@/lib/time/deps";
import { isTimeEmployeeError, mePayloadFor, requireTimeEmployee } from "@/lib/time/http";
import { trustedClientIp } from "@/lib/time/network";
import { recordPunch } from "@/lib/time/punch";
import type { GpsPermissionState, PunchType } from "@/lib/time/types";

const TYPES = new Set<PunchType>(["clock_in", "lunch_start", "lunch_end", "clock_out"]);
const GPS_STATES = new Set<GpsPermissionState>([
  "granted",
  "denied",
  "unavailable",
  "timeout",
  "not_requested",
]);

export async function POST(request: Request) {
  const employee = await requireTimeEmployee(request);
  if (isTimeEmployeeError(employee)) return employee;
  let body: {
    type?: string;
    latitude?: number;
    longitude?: number;
    accuracyM?: number;
    gpsCapturedAt?: string;
    gpsPermission?: string;
    clientReportedAt?: string;
    idempotencyKey?: string;
    deviceHint?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return timePrivateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const type = body.type as PunchType;
  if (!TYPES.has(type)) {
    return timePrivateJson({ error: "Unknown punch type." }, { status: 400 });
  }
  const key = String(body.idempotencyKey || "").trim();
  if (!key) {
    return timePrivateJson({ error: "Missing punch key." }, { status: 400 });
  }

  const geo =
    Number.isFinite(body.latitude) && Number.isFinite(body.longitude)
      ? {
          latitude: Number(body.latitude),
          longitude: Number(body.longitude),
          accuracyM: body.accuracyM ?? null,
          capturedAt: body.gpsCapturedAt || null,
          permission: "granted" as const,
        }
      : null;

  const gpsPermission: GpsPermissionState = geo
    ? "granted"
    : GPS_STATES.has(body.gpsPermission as GpsPermissionState)
      ? (body.gpsPermission as GpsPermissionState)
      : "unavailable";

  const store = await getTimeStore();
  const net = trustedClientIp(request);
  const ua = body.deviceHint || request.headers.get("user-agent");
  const existingDevice = trustedDeviceTokenFromRequest(request);
  const deviceRes = await resolveTrustedDevice(store, {
    employeeId: employee.id,
    existingToken: existingDevice,
    userAgent: ua,
  });

  const result = await recordPunch(store, {
    employee,
    type,
    geo,
    gpsPermission,
    clientReportedAt: body.clientReportedAt || null,
    clientIp: net.ip,
    networkClass: net.networkClass,
    officeNetworkMatch: net.officeNetworkMatch,
    trustedDevice: deviceRes.device,
    deviceKnown: deviceRes.known,
    newDevice: deviceRes.newDevice,
    idempotencyKey: key,
    deviceHint: ua,
  });
  if (!result.ok) {
    return timePrivateJson(
      { error: result.error, code: result.code },
      { status: result.status || 400, device: deviceRes.token },
    );
  }

  return timePrivateJson(
    {
      ok: true,
      duplicate: result.duplicate,
      punch: {
        id: result.punch.id,
        type: result.punch.type,
        occurredAt: result.punch.occurredAt,
        timezone: result.punch.timezone,
      },
      shift: result.shift,
      status: result.status,
      me: await mePayloadFor(employee),
      device: { trusted: deviceRes.known || !deviceRes.newDevice, newDevice: deviceRes.newDevice },
    },
    { session: buildTimeSession(employee), device: deviceRes.token },
  );
}
