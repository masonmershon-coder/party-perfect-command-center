/**
 * AI Core — server-side domain authorization.
 *
 * IDENTITY GOVERNS DOMAIN: the effective domain is derived from the AUTHENTICATED
 * session role, never from a client-supplied string. A client can *request* a persona
 * ("mike"/"matter"), but the server decides whether that domain is allowed.
 *
 * P2A mapping (reuses existing owner/employee auth — no new identity system):
 *   owner   (Mason via OWNER_PIN) → may act in party_perfect AND mershon_personal
 *   employee                      → party_perfect only
 */
import type { SessionRole } from "@/lib/server-auth";

export const PERSONA_DOMAIN: Record<string, string> = {
  mike: "party_perfect",
  matter: "mershon_personal",
};

export function allowedDomains(role: SessionRole): string[] {
  return role === "owner" ? ["party_perfect", "mershon_personal"] : ["party_perfect"];
}

/**
 * Resolve + authorize a requested domain (from a persona or a raw domain string)
 * against the session role. Returns the domain if allowed, else null (caller → 403).
 */
export function resolveAllowedDomain(role: SessionRole, requested: { persona?: string; domain?: string }): string | null {
  const raw = (requested.domain || (requested.persona ? PERSONA_DOMAIN[requested.persona.toLowerCase()] : "") || "").trim();
  if (!raw) return null;
  return allowedDomains(role).includes(raw) ? raw : null;
}

export function actorForRole(role: SessionRole): string {
  return role === "owner" ? "mason" : "staff";
}
