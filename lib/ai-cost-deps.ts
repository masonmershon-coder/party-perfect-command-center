import { createMemoryAiCostStore, type AiCostStore } from "@/lib/ai-cost-store";
import { isAiCostDbConfigured, PostgresAiCostStore } from "@/lib/ai-cost-pg";
import { loadGovernorPayload } from "@/lib/ai-cost-governor";
import type { AiCostEngine } from "@/lib/ai-cost";
import type { RateRow } from "@/lib/ai-cost-math";

const g = globalThis as unknown as {
  __aiCostMemoryStore?: AiCostStore;
  __aiCostPgStore?: AiCostStore;
};

export function getAiCostStore(): AiCostStore {
  if (isAiCostDbConfigured() && process.env.AI_COST_USE_PG === "1") {
    if (!g.__aiCostPgStore) g.__aiCostPgStore = new PostgresAiCostStore();
    return g.__aiCostPgStore;
  }
  if (!g.__aiCostMemoryStore) g.__aiCostMemoryStore = createMemoryAiCostStore();
  return g.__aiCostMemoryStore;
}

export function getAiCostEngine(overrides?: Partial<AiCostEngine>): AiCostEngine {
  return {
    store: overrides?.store ?? getAiCostStore(),
    rates: overrides?.rates ?? ([] as RateRow[]),
    now: overrides?.now ?? (() => new Date()),
    governorPayload: overrides?.governorPayload ?? loadGovernorPayload(),
  };
}

export function resetAiCostMemoryStoreForTests() {
  g.__aiCostMemoryStore = createMemoryAiCostStore();
}
