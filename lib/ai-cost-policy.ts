/**
 * Owner AI Cost & Usage policy. Seed values are USER_REPORTED, not provider-verified.
 * Do not invent metered usage, token totals, or billed amounts.
 */

import type { VerificationStatus } from "@/lib/ai-cost-math";

export const AI_COST_TASK_ID = "OWNER-AI-COST-USAGE-001";
export const AI_COST_INGEST_MAX_BYTES = 64 * 1024;
export const AI_COST_INGEST_MAX_EVENTS = 50;
export const AI_COST_ALERT_DEDUP_WINDOW_MS = 30 * 60 * 1000;

export type CostDomain = "party_perfect" | "mershon_personal";
export type CostKind = "fixed" | "metered" | "estimated" | "infrastructure";
export type BillingCadence = "monthly" | "yearly" | "weekly" | "unknown";

export type SeedSubscription = {
  id: string;
  providerId: string;
  plan: string;
  amount: number | null;
  currency: "USD";
  cadence: BillingCadence;
  effectiveDate: string;
  source: "USER_REPORTED";
  verificationStatus: VerificationStatus;
  notes: string;
  kind: CostKind;
  domain: CostDomain;
  partyPerfectAllocationPct: number | null;
  accountOwner: string;
  purpose: string;
  active: boolean;
};

/** Discovered from repo env names / packages. Never include secret values. */
export const KNOWN_PROVIDERS = [
  { id: "anthropic", label: "Anthropic / Claude", envNames: ["ANTHROPIC_API_KEY"], agents: ["claude", "matter", "mike"] },
  { id: "openai", label: "OpenAI / ChatGPT / Codex", envNames: ["OPENAI_API_KEY"], agents: ["chatgpt", "codex", "mike"] },
  { id: "cursor", label: "Cursor", envNames: [], agents: ["cursor", "mike"] },
  { id: "xai", label: "xAI / Grok", envNames: ["XAI_API_KEY"], agents: ["grok", "mike"] },
  { id: "supabase", label: "Supabase", envNames: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"], agents: ["matter", "mike", "cursor"] },
  { id: "vercel", label: "Vercel", envNames: ["VERCEL_OIDC_TOKEN"], agents: ["cursor"] },
  { id: "twilio", label: "Twilio", envNames: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"], agents: ["madison", "mike"] },
  { id: "github", label: "GitHub", envNames: ["GITHUB_TOKEN"], agents: ["cursor", "codex", "claude"] },
  { id: "upstash", label: "Upstash Redis", envNames: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], agents: ["mike", "cursor"] },
  { id: "fal", label: "fal.ai", envNames: ["FAL_KEY"], agents: ["mike"] },
  { id: "transcription", label: "Transcription (local/whisper)", envNames: [], agents: ["mike", "madison"] },
  { id: "embeddings", label: "Embeddings / vector", envNames: [], agents: [] },
] as const;

export const KNOWN_AGENTS = [
  { id: "matter", label: "Matter" },
  { id: "mike", label: "Mike" },
  { id: "madison", label: "Madison" },
  { id: "sentinel", label: "Sentinel" },
  { id: "claude", label: "Claude / Claw" },
  { id: "cursor", label: "Cursor" },
  { id: "codex", label: "Codex" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "grok", label: "Grok" },
  { id: "local_worker", label: "Local worker / automation" },
] as const;

/**
 * Owner-reported recurring seed. Cursor unknown. Vercel yearly ~$10 uncertain.
 * Hardware purchases are excluded from this ledger.
 */
export const SEED_SUBSCRIPTIONS: SeedSubscription[] = [
  {
    id: "sub-supabase",
    providerId: "supabase",
    plan: "Pro (owner-reported)",
    amount: 25,
    currency: "USD",
    cadence: "monthly",
    effectiveDate: "2026-08-01",
    source: "USER_REPORTED",
    verificationStatus: "USER_REPORTED",
    notes: "USER_REPORTED $25/month. Not provider-verified.",
    kind: "fixed",
    domain: "party_perfect",
    partyPerfectAllocationPct: 100,
    accountOwner: "Mason",
    purpose: "Command Center / AI Core database",
    active: true,
  },
  {
    id: "sub-claude",
    providerId: "anthropic",
    plan: "Claude subscription (owner-reported)",
    amount: 100,
    currency: "USD",
    cadence: "monthly",
    effectiveDate: "2026-08-01",
    source: "USER_REPORTED",
    verificationStatus: "USER_REPORTED",
    notes: "USER_REPORTED $100/month. Not provider-verified.",
    kind: "fixed",
    domain: "party_perfect",
    partyPerfectAllocationPct: 100,
    accountOwner: "Mason",
    purpose: "Claude / Claw agent work",
    active: true,
  },
  {
    id: "sub-chatgpt",
    providerId: "openai",
    plan: "ChatGPT Plus (owner-reported)",
    amount: 20,
    currency: "USD",
    cadence: "monthly",
    effectiveDate: "2026-08-01",
    source: "USER_REPORTED",
    verificationStatus: "USER_REPORTED",
    notes: "USER_REPORTED $20/month. Not provider-verified.",
    kind: "fixed",
    domain: "party_perfect",
    partyPerfectAllocationPct: 100,
    accountOwner: "Mason",
    purpose: "ChatGPT / Codex sessions",
    active: true,
  },
  {
    id: "sub-grok",
    providerId: "xai",
    plan: "Grok subscription (owner-reported)",
    amount: 99,
    currency: "USD",
    cadence: "monthly",
    effectiveDate: "2026-08-01",
    source: "USER_REPORTED",
    verificationStatus: "USER_REPORTED",
    notes: "USER_REPORTED $99/month. Not provider-verified.",
    kind: "fixed",
    domain: "party_perfect",
    partyPerfectAllocationPct: 100,
    accountOwner: "Mason",
    purpose: "Grok / Mike model access",
    active: true,
  },
  {
    id: "sub-vercel",
    providerId: "vercel",
    plan: "Vercel / domain-related (uncertain)",
    amount: 10,
    currency: "USD",
    cadence: "yearly",
    effectiveDate: "2026-01-01",
    source: "USER_REPORTED",
    verificationStatus: "UNVERIFIED",
    notes: "Approximately $10/year. Classification still uncertain. USER_REPORTED, not provider-verified.",
    kind: "infrastructure",
    domain: "party_perfect",
    partyPerfectAllocationPct: 100,
    accountOwner: "Mason",
    purpose: "partyperfect.app hosting / domain-related",
    active: true,
  },
  {
    id: "sub-cursor",
    providerId: "cursor",
    plan: "UNKNOWN",
    amount: null,
    currency: "USD",
    cadence: "unknown",
    effectiveDate: "2026-08-01",
    source: "USER_REPORTED",
    verificationStatus: "UNAVAILABLE",
    notes: "Cursor cost unknown until verified. Must not be counted as $0.",
    kind: "fixed",
    domain: "party_perfect",
    partyPerfectAllocationPct: 100,
    accountOwner: "Mason",
    purpose: "Command Center implementation",
    active: true,
  },
];

export const DEFAULT_BUDGETS = [] as const;

export const SPENDING_GUARDRAIL =
  "No AI agent may enable usage-based billing, pay-as-you-go, auto-recharge, credit purchases, spending-limit raises, subscription upgrades, paid resource provisioning, converting trials, billing-detail changes, purchase authorization, or cost-alert disablement without Mason's explicit approval. This dashboard observes and alerts only.";
