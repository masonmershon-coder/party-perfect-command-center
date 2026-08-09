import { Ratelimit } from "@upstash/ratelimit";
import { getDurableRedis, isDurableRedisConfigured } from "@/lib/durable-json";

/**
 * Spam doors for POST /api/jobs/apply — public paid endpoint (Grok + email + SMS).
 * Prefer Upstash Redis sliding windows; fall back to in-memory when Redis is missing (local/dev).
 */

const memoryHits = new Map<string, number[]>();

function memoryLimit(
  key: string,
  max: number,
  windowMs: number,
): { success: boolean } {
  const now = Date.now();
  const cuts = (memoryHits.get(key) || []).filter((t) => now - t < windowMs);
  if (cuts.length >= max) {
    memoryHits.set(key, cuts);
    return { success: false };
  }
  cuts.push(now);
  memoryHits.set(key, cuts);
  return { success: true };
}

let ipHourly: Ratelimit | null = null;
let identityDaily: Ratelimit | null = null;

function getLimiters() {
  if (!isDurableRedisConfigured()) return null;
  const redis = getDurableRedis();
  if (!redis) return null;
  if (!ipHourly) {
    ipHourly = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "pp:jobs:rl:ip",
      analytics: false,
    });
  }
  if (!identityDaily) {
    identityDaily = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "1 d"),
      prefix: "pp:jobs:rl:id",
      analytics: false,
    });
  }
  return { ipHourly, identityDaily };
}

export function normalizePhoneDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d;
}

export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns an error message when blocked; null when allowed. */
export async function enforceJobApplyRateLimits(input: {
  ip: string;
  email: string;
  phone: string;
}): Promise<string | null> {
  const ip = input.ip || "unknown";
  const email = normalizeEmailKey(input.email);
  const phone = normalizePhoneDigits(input.phone);
  const identity = phone.length >= 10 ? `p:${phone}` : email ? `e:${email}` : "";

  const limiters = getLimiters();
  if (limiters) {
    const ipResult = await limiters.ipHourly.limit(ip);
    if (!ipResult.success) {
      return "Too many applications from this network. Try again later today.";
    }
    if (identity) {
      const idResult = await limiters.identityDaily.limit(identity);
      if (!idResult.success) {
        return "You’ve already applied recently with this phone or email. We’ll be in touch.";
      }
    }
    return null;
  }

  // Local/dev fallback (no Redis)
  if (!memoryLimit(`ip:${ip}`, 10, 60 * 60 * 1000).success) {
    return "Too many applications from this network. Try again later today.";
  }
  if (identity && !memoryLimit(`id:${identity}`, 3, 24 * 60 * 60 * 1000).success) {
    return "You’ve already applied recently with this phone or email. We’ll be in touch.";
  }
  return null;
}
