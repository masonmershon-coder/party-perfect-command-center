/**
 * Matter policy engine — application-layer copy of
 * AI-HANDOFF/matter/security-gateway.mjs.
 *
 * Keep RESOURCE_TIER / ROLE_MAX_TIER / AGENT_SCOPE / injection patterns in
 * lock-step with that file. HTTP routes call evaluate() here; they do not
 * invent a second policy.
 *
 * Unlisted resources fail closed at tier 4.
 * Fail open for business / closed for privilege is a Sentinel rule, not
 * a Matter allow-all. Unmapped Matter *resource names* stay denied.
 */

export const RESOURCE_TIER = {
  health: 0,
  "inventory-read": 1,
  "customer-read": 2,
  task: 2,
  "control-plane": 2,
  "por-write": 3,
  payment: 3,
  "ad-spend": 3,
  "applicant-contact": 3,
  credential: 4,
  "security-config": 4,
  billing: 4,
} as const;

export type MatterResource = keyof typeof RESOURCE_TIER | (string & {});

export const ROLE_MAX_TIER = {
  SHOWROOM: 2,
  WAREHOUSE: 1,
  MANAGER: 2,
  OWNER: 4,
  CURSOR: 2,
  CLAUDE: 2,
  CODEX: 1,
  MATTER: 2,
  SENTINEL: 1,
} as const;

export type MatterRole = keyof typeof ROLE_MAX_TIER;

export const AGENT_SCOPE = {
  CURSOR: ["task", "control-plane", "inventory-read"],
  CLAUDE: ["task", "control-plane", "inventory-read", "customer-read"],
  CODEX: ["control-plane"],
  MATTER: ["control-plane", "task", "health"],
  SENTINEL: ["health", "control-plane"],
} as const;

const INJECTION_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "ignore_previous", re: /ignore\s+(all\s+)?previous\s+instructions/i },
  { id: "system_prompt_override", re: /system\s*prompt\s*(override|injection)/i },
  { id: "jailbreak", re: /\b(jailbreak|dan\s*mode|developer\s*mode)\b/i },
  { id: "reveal_secrets", re: /reveal\s+(your\s+)?(system\s+)?(prompt|api\s*keys?|secrets?)/i },
  { id: "role_hijack", re: /you\s+are\s+now\s+(unrestricted|root|admin|owner)/i },
];

export type MatterEvaluateRequest = {
  role: string;
  resource: string;
  action?: string;
  approval_granted?: boolean;
};

export type MatterDecision = {
  allowed: boolean;
  reason: string;
  role: string;
  resource: string;
  action: string;
  tier: number;
  timestamp: string;
};

export type InjectionScreen = {
  flagged: boolean;
  signalCount: number;
  signalIds: string[];
};

function unlistedResourceTier(resource: string): number {
  if (Object.prototype.hasOwnProperty.call(RESOURCE_TIER, resource)) {
    return RESOURCE_TIER[resource as keyof typeof RESOURCE_TIER];
  }
  return 4;
}

export function evaluate(req: MatterEvaluateRequest): MatterDecision {
  const role = String(req?.role || "").toUpperCase();
  const resource = String(req?.resource || "");
  const action = String(req?.action || "read");
  const approval = Boolean(req?.approval_granted);
  const tier = unlistedResourceTier(resource);
  const listed = Object.prototype.hasOwnProperty.call(RESOURCE_TIER, resource);
  const max = (ROLE_MAX_TIER as Record<string, number>)[role];
  const timestamp = new Date().toISOString();

  const base = {
    role,
    resource,
    action,
    tier,
    timestamp,
  };

  if (!listed) {
    return {
      ...base,
      allowed: false,
      reason: "fail_closed_unlisted_resource",
    };
  }

  if (max == null) {
    return { ...base, allowed: false, reason: "unknown_role" };
  }

  const agentScope = (AGENT_SCOPE as Record<string, readonly string[]>)[role];
  if (agentScope && !agentScope.includes(resource)) {
    return { ...base, allowed: false, reason: "agent_scope_denied" };
  }

  if (tier === 4 && !approval) {
    return { ...base, allowed: false, reason: "tier4_requires_approval" };
  }

  if (tier > max && !approval) {
    return { ...base, allowed: false, reason: "role_tier_exceeded" };
  }

  return { ...base, allowed: true, reason: "allowed" };
}

/**
 * Count injection signals only. Never echo matched text.
 */
export function screenUntrusted(text: unknown): InjectionScreen {
  const raw = typeof text === "string" ? text : "";
  const signalIds: string[] = [];
  for (const p of INJECTION_PATTERNS) {
    if (p.re.test(raw)) signalIds.push(p.id);
  }
  return {
    flagged: signalIds.length > 0,
    signalCount: signalIds.length,
    signalIds,
  };
}

export function mapSessionRoleToMatter(
  sessionRole: "employee" | "owner",
): MatterRole {
  return sessionRole === "owner" ? "OWNER" : "SHOWROOM";
}
