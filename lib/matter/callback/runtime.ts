import { DEFAULT_MAX_BODY_BYTES, FixedWindowRateLimiter, type ProcessorDeps } from "./processor";
import { parseKeyRing } from "./signature";
import { FileCallbackStore, MemoryCallbackStore, type CallbackStore } from "./store";

/**
 * Environment variable NAMES (values are never committed):
 *   MATTER_CALLBACK_ENABLED        "1" to enable outside production. Anything else = disabled.
 *   MATTER_CALLBACK_KEYS           JSON key ring (see signature.ts parseKeyRing).
 *   MATTER_CALLBACK_STORE          "memory" (default) | "file" (local only, needs MATTER_CALLBACK_DIR).
 *   MATTER_CALLBACK_DIR            directory for the local file store.
 *   MATTER_CALLBACK_RATE_PER_MIN   per-key limit, default 120.
 *   MATTER_CALLBACK_MAX_SKEW_SEC   timestamp window, default 300.
 */
export type CallbackRuntime =
  | { enabled: true; deps: Omit<ProcessorDeps, "log">; maxBodyBytes: number }
  | { enabled: false; reason: string };

let cached: { signature: string; runtime: CallbackRuntime } | null = null;

export function callbackRuntime(env: NodeJS.ProcessEnv = process.env): CallbackRuntime {
  const signature = [
    env.MATTER_CALLBACK_ENABLED,
    env.VERCEL_ENV,
    env.MATTER_CALLBACK_KEYS?.length,
    env.MATTER_CALLBACK_STORE,
    env.MATTER_CALLBACK_DIR,
    env.MATTER_CALLBACK_RATE_PER_MIN,
    env.MATTER_CALLBACK_MAX_SKEW_SEC,
  ].join("|");
  if (cached && cached.signature === signature) return cached.runtime;
  const runtime = build(env);
  cached = { signature, runtime };
  return runtime;
}

function build(env: NodeJS.ProcessEnv): CallbackRuntime {
  if (env.VERCEL_ENV === "production") return { enabled: false, reason: "disabled in production (preview/local only)" };
  if (env.MATTER_CALLBACK_ENABLED !== "1") return { enabled: false, reason: "MATTER_CALLBACK_ENABLED is not 1" };
  const ring = parseKeyRing(env.MATTER_CALLBACK_KEYS);
  if (!ring.ok) return { enabled: false, reason: ring.error };

  let store: CallbackStore;
  if (env.MATTER_CALLBACK_STORE === "file") {
    if (!env.MATTER_CALLBACK_DIR) return { enabled: false, reason: "MATTER_CALLBACK_STORE=file requires MATTER_CALLBACK_DIR" };
    if (env.VERCEL) return { enabled: false, reason: "file store is local-only" };
    store = new FileCallbackStore(env.MATTER_CALLBACK_DIR);
  } else {
    store = new MemoryCallbackStore();
  }
  const rate = Number(env.MATTER_CALLBACK_RATE_PER_MIN || 120);
  const skew = Number(env.MATTER_CALLBACK_MAX_SKEW_SEC || 300);
  return {
    enabled: true,
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
    deps: {
      keys: ring.keys,
      store,
      rateLimiter: new FixedWindowRateLimiter(Number.isFinite(rate) && rate > 0 ? rate : 120),
      maxSkewSec: Number.isFinite(skew) && skew > 0 && skew <= 900 ? skew : 300,
    },
  };
}

/**
 * Read at most `max` bytes. Returns null once the limit is exceeded so an oversized body
 * is never fully buffered.
 */
export async function readBodyLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}
