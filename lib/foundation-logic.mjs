// ============================================================
//  AI Core foundation logic — pure, dependency-free, offline-testable.
//  Single source of truth for: content hashing, artifact dedup decisions,
//  safe-retry gating, AI usage-record shaping (redaction by construction),
//  cost estimation, and domain governance. The TS app imports these so the
//  logic proven by scripts/foundation/foundation.test.mjs is the SAME logic
//  that runs in production. No DB, no network, no secrets in scope.
// ============================================================
import { createHash } from "node:crypto";

// ---- content hash (the dedup key) ----
export function sha256Hex(bufOrString) {
  return createHash("sha256").update(bufOrString).digest("hex");
}

// ---- worker service-auth (PP-010; port to lib/ai-core-worker-auth.ts) ----
import { timingSafeEqual } from "node:crypto";

// Constant-time string compare, length-guarded (no early-out on length).
export function constantTimeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) { try { timingSafeEqual(ab, ab); } catch {} return false; }
  return timingSafeEqual(ab, bb);
}

// v0: ONE env token -> ONE fixed identity. No token DB. Same seam grows later.
export function resolveWorkerActor(token, { expected } = {}) {
  const exp = (expected ?? "").trim();
  if (!exp || !token || !constantTimeEqual(token, exp)) return null;
  return { actorId: "matter-intake-worker", allowedDomains: ["party_perfect"], scopes: ["CREATE_TASK"] };
}

// The worker never gains arbitrary authority: domain comes from persona server-side,
// then must be inside the identity's allowed set, and the scope must be granted.
export function workerCanCreate(identity, persona) {
  if (!identity) return { ok: false, status: 401 };
  const domain = PERSONA_DOMAIN[String(persona || "mike").toLowerCase()];
  if (!domain || !identity.allowedDomains.includes(domain)) return { ok: false, status: 403 };
  if (!identity.scopes.includes("CREATE_TASK")) return { ok: false, status: 403 };
  return { ok: true, status: 200, domain, createdBy: identity.actorId };
}

// ---- domain governance (mirror of lib/ai-core-auth.ts) ----
export const PERSONA_DOMAIN = { mike: "party_perfect", matter: "mershon_personal" };
export function allowedDomains(role) {
  return role === "owner" ? ["party_perfect", "mershon_personal"] : ["party_perfect"];
}
// Identity governs domain: a client-supplied domain/persona is only honored if the
// authenticated role allows it. Returns the effective domain, or null (=> 403).
export function resolveAllowedDomain(role, requested = {}) {
  const raw = (requested.domain || (requested.persona ? PERSONA_DOMAIN[String(requested.persona).toLowerCase()] : "") || "").trim();
  if (!raw) return null;
  return allowedDomains(role).includes(raw) ? raw : null;
}

// ---- artifact dedup decision (SAME DOMAIN + SAME CONTENT HASH) ----
// existing = the current artifacts row for (domain, sha256), or null/undefined.
// Returns the action to take BEFORE any store/transcribe/model spend.
export const MAX_ARTIFACT_RETRIES = 3;
export function decideIngest(existing, { maxRetries = MAX_ARTIFACT_RETRIES } = {}) {
  if (!existing) return { action: "store-and-process", reason: "new-content" };
  switch (existing.processing_status) {
    case "DONE":
      // reuse the valid prior result — no store, no transcribe, no spend
      return { action: "reuse", artifactId: existing.id, resultRef: existing.processing_result_ref, reason: "already-processed" };
    case "PENDING":
    case "PROCESSING":
      // already in flight — attach to it, don't double-store or double-process
      return { action: "attach-wait", artifactId: existing.id, reason: "in-flight" };
    case "FAILED":
      if ((existing.retry_count ?? 0) < maxRetries) {
        // safe retry: reprocess the SAME artifact row, bump the counter (no duplicate row)
        return { action: "retry", artifactId: existing.id, retryCount: (existing.retry_count ?? 0) + 1, reason: "prior-failed" };
      }
      return { action: "give-up", artifactId: existing.id, reason: "max-retries-exhausted" };
    default:
      return { action: "attach-wait", artifactId: existing.id, reason: "unknown-status" };
  }
}
export function canRetry(existing, maxRetries = MAX_ARTIFACT_RETRIES) {
  return !!existing && existing.processing_status === "FAILED" && (existing.retry_count ?? 0) < maxRetries;
}

// ---- cost estimation (approximate; trend not accounting) ----
// USD per 1M tokens. Extend as models/providers are added. Unknown model -> null cost.
export const RATE_TABLE = {
  xai: {
    // placeholder rates — [CONFIRM against xAI pricing]; shape is what matters now
    "grok-default": { in: 2.0, out: 10.0, cached: 0.5 },
  },
  openai: {},
  fal: {}, // media priced per-image/second, handled as actual_cost when returned
  local: { "*": { in: 0, out: 0, cached: 0 } },
};
export function estimateCostUsd(provider, model, { input_tokens = 0, output_tokens = 0, cached_tokens = 0 } = {}) {
  const p = RATE_TABLE[provider];
  if (!p) return null;
  const rate = p[model] || p["*"];
  if (!rate) return null;
  const billedInput = Math.max(0, input_tokens - cached_tokens);
  const usd = (billedInput * (rate.in || 0) + output_tokens * (rate.out || 0) + cached_tokens * (rate.cached || 0)) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

// ---- usage record shaping (REDACTION BY CONSTRUCTION) ----
// Only these fields are ever persisted. Prompt/response bodies, api keys, PII, and
// any unlisted field are dropped on the floor — they cannot reach the log.
export const USAGE_FIELDS = [
  "at", "domain", "persona", "provider", "model", "operation",
  "input_tokens", "output_tokens", "cached_tokens", "est_cost_usd", "actual_cost_usd",
  "latency_ms", "retries", "success", "error",
  "from_cache", "escalated", "escalation_reason", "context_record_count", "context_refs",
  "task_id", "artifact_id", "meeting_id", "job_ref",
];
export function buildUsageRecord(input = {}) {
  const rec = {};
  for (const k of USAGE_FIELDS) if (input[k] !== undefined) rec[k] = input[k];
  // server-authoritative + derived defaults
  rec.at = input.at || new Date().toISOString();
  rec.success = input.success !== false;
  rec.retries = input.retries ?? 0;
  rec.from_cache = !!input.from_cache;
  rec.escalated = !!input.escalated;
  if (rec.est_cost_usd === undefined && rec.provider && rec.model && !rec.from_cache) {
    const est = estimateCostUsd(rec.provider, rec.model, rec);
    if (est !== null) rec.est_cost_usd = est;
  }
  if (rec.from_cache) { rec.input_tokens = 0; rec.output_tokens = 0; rec.est_cost_usd = 0; }
  // context_refs must be ids/paths only — coerce to strings, never objects with bodies
  if (Array.isArray(rec.context_refs)) rec.context_refs = rec.context_refs.map((r) => (typeof r === "string" ? r : String(r?.id ?? r?.ref ?? "")));
  return rec;
}
