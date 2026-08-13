import { Ratelimit } from "@upstash/ratelimit";
import { getDurableRedis, isDurableRedisConfigured } from "@/lib/durable-json";
import { normalizePhoneDigits } from "@/lib/job-apply-validate";

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
let phoneDaily: Ratelimit | null = null;

function getLimiters() {
  if (!isDurableRedisConfigured()) return null;
  const redis = getDurableRedis();
  if (!redis) return null;
  if (!ipHourly) {
    ipHourly = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(8, "1 h"),
      prefix: "pp:quote-inq:rl:ip",
      analytics: false,
    });
  }
  if (!phoneDaily) {
    phoneDaily = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(4, "1 d"),
      prefix: "pp:quote-inq:rl:ph",
      analytics: false,
    });
  }
  return { ipHourly, phoneDaily };
}

export async function enforceWebQuoteInquiryRateLimits(input: {
  ip: string;
  phone: string;
}): Promise<string | null> {
  const ip = input.ip || "unknown";
  const phone = normalizePhoneDigits(input.phone);
  const limiters = getLimiters();
  if (limiters) {
    const ipResult = await limiters.ipHourly.limit(ip);
    if (!ipResult.success) {
      return "Too many quote requests from this network. Call 918-258-7368 or try again later.";
    }
    if (phone.length >= 10) {
      const ph = await limiters.phoneDaily.limit(`p:${phone}`);
      if (!ph.success) {
        return "We already have a recent request from this phone. The showroom will follow up, or call 918-258-7368.";
      }
    }
    return null;
  }
  if (!memoryLimit(`ip:${ip}`, 8, 60 * 60 * 1000).success) {
    return "Too many quote requests from this network. Call 918-258-7368 or try again later.";
  }
  if (
    phone.length >= 10 &&
    !memoryLimit(`ph:${phone}`, 4, 24 * 60 * 60 * 1000).success
  ) {
    return "We already have a recent request from this phone. The showroom will follow up, or call 918-258-7368.";
  }
  return null;
}
