/**
 * Talk-to-Mike device + worker auth.
 * Stores/compares SHA-256 verifiers only. Never logs the presented token.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import type { MikeIntakeDevice, MikeIntakeSenderId } from "./mike-intake-policy";

export type MikeIntakePrincipal =
  | { kind: "device"; senderId: MikeIntakeSenderId; responseThread: string }
  | { kind: "worker"; workerId: "mac-outbound" };

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashesEqual(a: string, b: string): boolean {
  const aa = Buffer.from(String(a).toLowerCase());
  const bb = Buffer.from(String(b).toLowerCase());
  if (aa.length !== bb.length) {
    try {
      timingSafeEqual(aa, aa);
    } catch {
      // ignore
    }
    return false;
  }
  return timingSafeEqual(aa, bb);
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)/i.exec(header);
  return m?.[1] || null;
}

/** Reject tokens passed via query string even if a header is also present. */
export function requestHasTokenQuery(request: Request): boolean {
  try {
    const url = new URL(request.url);
    return [...url.searchParams.keys()].some((k) =>
      /token|secret|password|key/i.test(k),
    );
  } catch {
    return false;
  }
}

export function devicesFromEnv(
  env: Record<string, string | undefined> = process.env,
): MikeIntakeDevice[] {
  const rows: MikeIntakeDevice[] = [];
  const masonHash = env.MIKE_INTAKE_MASON_TOKEN_SHA256?.trim().toLowerCase() || "";
  const joshHash = env.MIKE_INTAKE_JOSH_TOKEN_SHA256?.trim().toLowerCase() || "";
  if (masonHash) {
    rows.push({
      senderId: "mason",
      tokenSha256: masonHash,
      revoked: env.MIKE_INTAKE_MASON_REVOKED === "1" || env.MIKE_INTAKE_MASON_REVOKED === "true",
      responseThread: "mike-mason",
    });
  }
  if (joshHash) {
    rows.push({
      senderId: "josh",
      tokenSha256: joshHash,
      revoked: env.MIKE_INTAKE_JOSH_REVOKED === "1" || env.MIKE_INTAKE_JOSH_REVOKED === "true",
      responseThread: "mike-josh",
    });
  }
  return rows;
}

export function resolveDevice(
  presentedToken: string | null,
  devices: MikeIntakeDevice[],
): { ok: true; device: MikeIntakeDevice } | { ok: false; status: 401 | 403; error: string } {
  if (!presentedToken) return { ok: false, status: 401, error: "unauthorized" };
  const presentedHash = sha256Hex(presentedToken);
  let matched: MikeIntakeDevice | null = null;
  for (const d of devices) {
    if (hashesEqual(presentedHash, d.tokenSha256)) {
      matched = d;
      break;
    }
  }
  if (!matched) return { ok: false, status: 401, error: "unauthorized" };
  if (matched.revoked) return { ok: false, status: 403, error: "revoked" };
  return { ok: true, device: matched };
}

export function resolveWorker(
  presentedToken: string | null,
  env: Record<string, string | undefined> = process.env,
): { ok: true } | { ok: false; status: 401 | 403; error: string } {
  const expected = env.MIKE_INTAKE_WORKER_TOKEN_SHA256?.trim().toLowerCase() || "";
  if (!presentedToken || !expected) return { ok: false, status: 401, error: "unauthorized" };
  if (!hashesEqual(sha256Hex(presentedToken), expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (env.MIKE_INTAKE_WORKER_REVOKED === "1" || env.MIKE_INTAKE_WORKER_REVOKED === "true") {
    return { ok: false, status: 403, error: "revoked" };
  }
  return { ok: true };
}

export function deviceCannotUseWorkerRoutes(): { status: 403; error: string } {
  return { status: 403, error: "forbidden" };
}
