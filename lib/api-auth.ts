/**
 * Canonical Command Center API authorization.
 *
 * Middleware intentionally skips /api/* (webhooks on legacy hosts).
 * Every non-public route MUST call requireApiAuth (or machine-auth equivalent).
 *
 * Reuses cookie sessions from server-auth — does not invent a second system.
 */
import { NextResponse } from "next/server";
import {
  isAuthError,
  requireOwner,
  requireSession,
  type AuthSession,
  type SessionRole,
} from "@/lib/server-auth";
import { NO_STORE_HEADERS } from "@/lib/no-store";

export { isAuthError };
export type { AuthSession, SessionRole };

/** Capability keys — least privilege mapped onto employee | owner. */
export type ApiPermission =
  | "session" // any authenticated user
  | "agents"
  | "tasks"
  | "emails"
  | "social"
  | "design"
  | "quoting"
  | "inventory"
  | "hiring"
  | "por"
  | "connections"
  | "live_ops"
  | "marketing"
  | "bookkeeping"
  | "reports"
  | "admin"
  | "sms_ops";

const OWNER_ONLY: ReadonlySet<ApiPermission> = new Set([
  "marketing",
  "bookkeeping",
  "reports",
  "admin",
  "sms_ops",
]);

export function roleHasPermission(
  role: SessionRole,
  permission: ApiPermission,
): boolean {
  if (role === "owner") return true;
  if (permission === "session") return true;
  if (OWNER_ONLY.has(permission)) return false;
  return true;
}

export function privateJson(
  data: unknown,
  init?: { status?: number },
): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: NO_STORE_HEADERS,
  });
}

/**
 * Server-side gate for Command Center JSON APIs.
 * Unauthenticated → 401 · authenticated but insufficient → 403.
 */
export async function requireApiAuth(
  permission: ApiPermission = "session",
): Promise<AuthSession | NextResponse> {
  if (OWNER_ONLY.has(permission)) {
    const gate = await requireOwner();
    if (isAuthError(gate)) {
      gate.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
      return gate;
    }
    return gate;
  }

  const gate = await requireSession();
  if (isAuthError(gate)) {
    gate.headers.set("Cache-Control", NO_STORE_HEADERS["Cache-Control"]);
    return gate;
  }
  if (!roleHasPermission(gate.role, permission)) {
    return privateJson({ error: "Forbidden" }, { status: 403 });
  }
  return gate;
}

/** Routes that are intentionally reachable without a CC session cookie. */
export const PUBLIC_API_ROUTES = [
  { path: "/api/auth/session", reason: "login + session probe" },
  { path: "/api/auth/meta/callback", reason: "OAuth callback" },
  { path: "/api/auth/google-ads/callback", reason: "OAuth callback" },
  { path: "/api/jobs/apply", reason: "public job application" },
  { path: "/api/health", reason: "uptime / ops probe (no secrets in body)" },
  { path: "/api/sms/inbound", reason: "Twilio webhook (signature auth)" },
] as const;

/** Machine principals — not cookie auth; each route validates its own secret. */
export const MACHINE_API_ROUTES = [
  { path: "/api/por/sync", reason: "POST Bearer POR_SYNC_SECRET; GET requires session" },
  { path: "/api/por/sync/catalog", reason: "Bearer POR_SYNC_SECRET" },
  { path: "/api/por/sync/catalog-images", reason: "Bearer POR_SYNC_SECRET" },
  { path: "/api/por/sync/crm", reason: "Bearer POR_SYNC_SECRET" },
  { path: "/api/por/sync/postgres", reason: "Bearer POR_SYNC_SECRET" },
  { path: "/api/por/sync/reservations", reason: "Bearer POR_SYNC_SECRET" },
  { path: "/api/cron/social", reason: "Bearer CRON_SECRET" },
  { path: "/api/cron/weekly-recap", reason: "Bearer CRON_SECRET" },
] as const;
