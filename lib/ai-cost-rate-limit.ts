const memoryHits = new Map<string, number[]>();

export const AI_COST_INGEST_PER_MINUTE = 30;

function memoryLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cuts = (memoryHits.get(key) || []).filter((t) => now - t < windowMs);
  if (cuts.length >= max) {
    memoryHits.set(key, cuts);
    return false;
  }
  cuts.push(now);
  memoryHits.set(key, cuts);
  return true;
}

export function enforceAiCostIngestLimit(principal: string): string | null {
  if (!memoryLimit(`ai-cost:${principal}`, AI_COST_INGEST_PER_MINUTE, 60 * 1000)) {
    return "rate_limited";
  }
  return null;
}

export function resetAiCostRateLimitForTests() {
  memoryHits.clear();
}
