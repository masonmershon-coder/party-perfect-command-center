/**
 * SEC-GATEWAY-WIRE-001 — Matter evaluate() at the HTTP boundary.
 *
 * Maps Command Center sessions (employee|owner) onto Matter roles
 * (SHOWROOM|OWNER). Does not invent a second policy. Does not treat
 * owner PIN as Matter tier-4 approval_granted.
 *
 * Unlisted Matter resource names fail closed. Existing unmapped *HTTP
 * routes* stay behind requireSession/requireApiAuth — do not lock
 * employees out of day-to-day ops.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  evaluate,
  mapSessionRoleToMatter,
  type MatterDecision,
  type MatterEvaluateRequest,
} from "./matter-gateway";

export type MatterHttpGateResult =
  | { allowed: true; decision: MatterDecision }
  | { allowed: false; status: 403; decision: MatterDecision };

const AUDIT_REL = path.join("AI-HANDOFF", "SECURITY_AUDIT.jsonl");

function auditDecision(decision: MatterDecision) {
  try {
    const root = process.cwd();
    const file = path.join(root, AUDIT_REL);
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(
      file,
      `${JSON.stringify({ kind: "matter_http", ...decision })}\n`,
    );
  } catch {
    // Vercel / read-only FS — decision still enforced; audit best-effort.
  }
}

/** HTTP-layer Matter gate. Call from requireApiAuth or tests. */
export function matterHttpGate(
  req: MatterEvaluateRequest,
): MatterHttpGateResult {
  const decision = evaluate(req);
  auditDecision(decision);
  if (!decision.allowed) {
    return { allowed: false, status: 403, decision };
  }
  return { allowed: true, decision };
}

/**
 * CC permission → Matter resource/action.
 * All values must be listed in RESOURCE_TIER. Unknown permission fails closed.
 * Never map day-to-day CC ops to tier-4 (credential / security-config / billing).
 */
export const MATTER_FOR_PERMISSION = {
  session: { resource: "health", action: "read" },
  agents: { resource: "task", action: "read" },
  tasks: { resource: "task", action: "read" },
  emails: { resource: "task", action: "read" },
  social: { resource: "task", action: "read" },
  design: { resource: "task", action: "read" },
  quoting: { resource: "customer-read", action: "read" },
  inventory: { resource: "inventory-read", action: "read" },
  hiring: { resource: "task", action: "read" },
  por: { resource: "inventory-read", action: "read" },
  connections: { resource: "task", action: "read" },
  live_ops: { resource: "task", action: "read" },
  marketing: { resource: "ad-spend", action: "read" },
  bookkeeping: { resource: "payment", action: "read" },
  reports: { resource: "task", action: "read" },
  admin: { resource: "control-plane", action: "read" },
  sms_ops: { resource: "control-plane", action: "read" },
  security: { resource: "task", action: "read" },
  ai_cost: { resource: "payment", action: "read" },
} as const;

export type MatterMappedPermission = keyof typeof MATTER_FOR_PERMISSION;

export function matterRoleForSession(role: "employee" | "owner") {
  return mapSessionRoleToMatter(role);
}
