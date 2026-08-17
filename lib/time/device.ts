import { randomUUID } from "node:crypto";
import {
  buildTrustedDeviceToken,
  coarsePlatformHint,
  type TrustedDeviceToken,
} from "@/lib/time/auth";
import type { TimeStore } from "@/lib/time/store";
import type { TrustedDevice } from "@/lib/time/types";

export type DeviceResolution = {
  device: TrustedDevice;
  token: TrustedDeviceToken;
  known: boolean;
  newDevice: boolean;
};

/**
 * Resolve or mint a first-party trusted device for this employee after login / on punch.
 * IP is never used as device identity.
 */
export async function resolveTrustedDevice(
  store: TimeStore,
  input: {
    employeeId: string;
    existingToken: TrustedDeviceToken | null;
    userAgent: string | null;
    now?: Date;
  },
): Promise<DeviceResolution> {
  const nowIso = (input.now ?? new Date()).toISOString();
  const platform = coarsePlatformHint(input.userAgent);

  if (input.existingToken && input.existingToken.employeeId === input.employeeId) {
    const row = await store.getTrustedDevice(input.existingToken.deviceId);
    if (row && row.employeeId === input.employeeId && row.active && !row.revokedAt) {
      const touched = await store.upsertTrustedDevice({
        ...row,
        lastSeenAt: nowIso,
        platformHint: row.platformHint || platform,
      });
      return {
        device: touched,
        token: buildTrustedDeviceToken(touched.id, input.employeeId),
        known: true,
        newDevice: false,
      };
    }
  }

  const created: TrustedDevice = {
    id: randomUUID(),
    employeeId: input.employeeId,
    label: platform ? `${platform} phone` : "Personal device",
    platformHint: platform,
    firstSeenAt: nowIso,
    lastSeenAt: nowIso,
    active: true,
    revokedAt: null,
  };
  await store.upsertTrustedDevice(created);
  return {
    device: created,
    token: buildTrustedDeviceToken(created.id, input.employeeId),
    known: false,
    newDevice: true,
  };
}
