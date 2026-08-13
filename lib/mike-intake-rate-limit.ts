import { Ratelimit } from "@upstash/ratelimit";
import { getDurableRedis, isDurableRedisConfigured } from "./durable-json";
import { MIKE_INTAKE_CREATE_PER_HOUR } from "./mike-intake-policy";

const memoryHits = new Map<string, number[]>();

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

let limiter: Ratelimit | null = null;

export async function enforceMikeIntakeCreateLimit(senderId: string): Promise<string | null> {
  if (isDurableRedisConfigured()) {
    const redis = getDurableRedis();
    if (redis) {
      if (!limiter) {
        limiter = new Ratelimit({
          redis,
          limiter: Ratelimit.slidingWindow(MIKE_INTAKE_CREATE_PER_HOUR, "1 h"),
          prefix: "pp:mike-intake:rl",
          analytics: false,
        });
      }
      const result = await limiter.limit(senderId);
      if (!result.success) return "rate_limited";
      return null;
    }
  }
  if (!memoryLimit(`s:${senderId}`, MIKE_INTAKE_CREATE_PER_HOUR, 60 * 60 * 1000)) {
    return "rate_limited";
  }
  return null;
}

export function resetMikeIntakeRateLimitForTests() {
  memoryHits.clear();
}
