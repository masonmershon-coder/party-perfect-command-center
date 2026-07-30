import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { getDataDir, isVercelRuntime } from "./data-dir";

const BLOB_PREFIX = "party-perfect";
const REDIS_PREFIX = "pp:json:";
const REDIS_ALL_KEYS = "pp:all-keys";
const MEMORY_TTL_MS = 45_000;

export type DurableStoreMode = "redis" | "blob" | "local" | "ephemeral";

type MemoryEntry = { expiresAt: number; value: unknown };

const memoryCache = new Map<string, MemoryEntry>();

let redisClient: Redis | null | undefined;

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || "";
}

function redisUrl() {
  return (
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    ""
  );
}

function redisToken() {
  return (
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    ""
  );
}

export function isDurableRedisConfigured() {
  return Boolean(redisUrl() && redisToken());
}

export function isDurableBlobConfigured() {
  return Boolean(blobToken());
}

export function durableStoreMode(): DurableStoreMode {
  if (isDurableRedisConfigured()) return "redis";
  if (isDurableBlobConfigured()) return "blob";
  if (isVercelRuntime()) return "ephemeral";
  return "local";
}

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  if (!isDurableRedisConfigured()) {
    redisClient = null;
    return null;
  }
  redisClient = new Redis({
    url: redisUrl(),
    token: redisToken(),
  });
  return redisClient;
}

/** Shared Redis client for append-only stores (jobs, etc.). */
export function getDurableRedis(): Redis | null {
  return getRedis();
}

/**
 * Probe durable store with a tiny write/read/delete cycle.
 * Prefer Redis; fall back to Blob put/get when Redis is not configured.
 */
export async function probeJobsDurableStore(): Promise<{
  ok: boolean;
  mode: DurableStoreMode;
  error?: string;
}> {
  const mode = durableStoreMode();
  const probeKey = `pp:health:jobs:${Date.now()}`;
  const payload = { ok: true, at: new Date().toISOString() };

  try {
    if (isDurableRedisConfigured()) {
      const redis = getRedis();
      if (!redis) {
        return { ok: false, mode, error: "Redis configured but client unavailable." };
      }
      await redis.set(probeKey, payload, { ex: 60 });
      const read = await redis.get(probeKey);
      await redis.del(probeKey);
      if (read == null) {
        return { ok: false, mode, error: "Redis probe read missed." };
      }
      return { ok: true, mode };
    }

    if (isDurableBlobConfigured()) {
      const text = `${JSON.stringify(payload)}\n`;
      const pathname = blobPathname(`health-jobs-probe.json`);
      const { put, get, del } = await import("@vercel/blob");
      await put(pathname, text, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        token: blobToken(),
      });
      const result = await get(pathname, {
        access: "private",
        token: blobToken(),
        useCache: false,
      });
      await del(pathname, { token: blobToken() });
      if (!result?.stream) {
        return { ok: false, mode, error: "Blob probe read missed." };
      }
      return { ok: true, mode };
    }

    if (!isVercelRuntime()) {
      await writeLocalText("health-jobs-probe.json", `${JSON.stringify(payload)}\n`);
      const local = await readLocalText("health-jobs-probe.json");
      try {
        await fs.unlink(localPath("health-jobs-probe.json"));
      } catch {
        // ignore
      }
      if (!local) {
        return { ok: false, mode, error: "Local probe read missed." };
      }
      return { ok: true, mode };
    }

    return {
      ok: false,
      mode,
      error: "No Redis or Blob configured on Vercel — applications cannot be saved.",
    };
  } catch (error) {
    return {
      ok: false,
      mode,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function redisDataKey(key: string) {
  return `${REDIS_PREFIX}${key.replace(/^\/+/, "").replace(/\\/g, "/")}`;
}

function indexKeyFor(key: string) {
  const clean = key.replace(/^\/+/, "").replace(/\\/g, "/");
  const slash = clean.indexOf("/");
  if (slash === -1) return null;
  return `pp:index:${clean.slice(0, slash + 1)}`;
}

function blobPathname(key: string) {
  const clean = key.replace(/^\/+/, "").replace(/\\/g, "/");
  return `${BLOB_PREFIX}/${clean}`;
}

function localPath(key: string) {
  return path.join(getDataDir(), key);
}

function readMemory<T>(key: string): { hit: true; value: T } | { hit: false } {
  const entry = memoryCache.get(key);
  if (!entry) return { hit: false };
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return { hit: false };
  }
  return { hit: true, value: entry.value as T };
}

function writeMemory(key: string, value: unknown) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
}

function clearMemory(key: string) {
  memoryCache.delete(key);
}

function parseText<T>(text: string | null | undefined, fallback: T): T {
  if (text == null || !String(text).trim()) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function coerceRedisValue<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") return parseText(value, fallback);
  return value as T;
}

async function streamToText(stream: ReadableStream | null) {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function readBlobText(key: string): Promise<string | null> {
  if (!isDurableBlobConfigured()) return null;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(blobPathname(key), {
      access: "private",
      token: blobToken(),
      useCache: true,
    });
    if (!result?.stream) return "";
    return streamToText(result.stream);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|404/i.test(message)) return "";
    console.error(`[durable-json] Blob read failed (${key}):`, message);
    return null;
  }
}

async function writeBlobText(key: string, text: string) {
  if (!isDurableBlobConfigured()) return false;
  try {
    const { put } = await import("@vercel/blob");
    await put(blobPathname(key), text, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: blobToken(),
    });
    return true;
  } catch (error) {
    console.error(
      `[durable-json] Blob write failed (${key}):`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

async function readLocalText(key: string): Promise<string | null> {
  try {
    return await fs.readFile(localPath(key), "utf8");
  } catch {
    return null;
  }
}

async function writeLocalText(key: string, text: string) {
  const filePath = localPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf8");
}

async function readRedisValue(key: string): Promise<"miss" | "error" | unknown> {
  const redis = getRedis();
  if (!redis) return "error";
  try {
    const value = await redis.get(redisDataKey(key));
    return value == null ? "miss" : value;
  } catch (error) {
    console.error(
      `[durable-json] Redis read failed (${key}):`,
      error instanceof Error ? error.message : error,
    );
    return "error";
  }
}

async function writeRedisValue(key: string, data: unknown) {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const indexKey = indexKeyFor(key);
    const pipeline = redis.pipeline();
    pipeline.set(redisDataKey(key), data);
    pipeline.sadd(REDIS_ALL_KEYS, key);
    if (indexKey) pipeline.sadd(indexKey, key);
    await pipeline.exec();
    return true;
  } catch (error) {
    console.error(
      `[durable-json] Redis write failed (${key}):`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

async function deleteRedisValue(key: string) {
  const redis = getRedis();
  if (!redis) return;
  try {
    const indexKey = indexKeyFor(key);
    const pipeline = redis.pipeline();
    pipeline.del(redisDataKey(key));
    pipeline.srem(REDIS_ALL_KEYS, key);
    if (indexKey) pipeline.srem(indexKey, key);
    await pipeline.exec();
  } catch (error) {
    console.error(
      `[durable-json] Redis delete failed (${key}):`,
      error instanceof Error ? error.message : error,
    );
  }
}

/** One-time hydrate into Redis from Blob/local when Redis misses. */
async function hydrateIntoRedis<T>(key: string, fallback: T): Promise<T> {
  const fromBlob = await readBlobText(key);
  if (fromBlob != null && fromBlob.trim()) {
    const parsed = parseText(fromBlob, fallback);
    await writeRedisValue(key, parsed);
    return parsed;
  }

  const local = await readLocalText(key);
  if (local != null && local.trim()) {
    const parsed = parseText(local, fallback);
    await writeRedisValue(key, parsed);
    return parsed;
  }

  return fallback;
}

/**
 * Read JSON by relative key.
 * Preference: memory → Redis → Blob/local hydrate → Blob → local.
 */
export async function readDurableJson<T>(
  key: string,
  fallback: T,
): Promise<T> {
  const cached = readMemory<T>(key);
  if (cached.hit) return cached.value;

  if (isDurableRedisConfigured()) {
    const fromRedis = await readRedisValue(key);
    if (fromRedis === "error") {
      const hydrated = await hydrateIntoRedis(key, fallback);
      writeMemory(key, hydrated);
      return hydrated;
    }
    if (fromRedis === "miss") {
      const hydrated = await hydrateIntoRedis(key, fallback);
      writeMemory(key, hydrated);
      return hydrated;
    }
    const value = coerceRedisValue(fromRedis, fallback);
    writeMemory(key, value);
    return value;
  }

  if (isDurableBlobConfigured()) {
    const fromBlob = await readBlobText(key);
    if (fromBlob === null) {
      const local = await readLocalText(key);
      const value = parseText(local, fallback);
      writeMemory(key, value);
      return value;
    }
    const value = parseText(fromBlob, fallback);
    writeMemory(key, value);
    return value;
  }

  const local = await readLocalText(key);
  const value = parseText(local, fallback);
  writeMemory(key, value);
  return value;
}

/**
 * Write JSON by relative key. Redis is the launch primary on Vercel.
 */
export async function writeDurableJson(key: string, data: unknown) {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  clearMemory(key);
  writeMemory(key, data);

  if (isDurableRedisConfigured()) {
    const ok = await writeRedisValue(key, data);
    if (ok) {
      if (!isVercelRuntime()) {
        await writeLocalText(key, text);
      }
      return;
    }
    if (isVercelRuntime()) {
      throw new Error(
        `Could not save ${key} to Redis. Check UPSTASH_REDIS_REST_URL / TOKEN.`,
      );
    }
  }

  if (isDurableBlobConfigured()) {
    const ok = await writeBlobText(key, text);
    if (ok) {
      if (!isVercelRuntime()) {
        await writeLocalText(key, text);
      }
      return;
    }
    if (isVercelRuntime()) {
      throw new Error(
        `Could not save ${key}. Configure Upstash Redis (recommended) or Blob.`,
      );
    }
  }

  await writeLocalText(key, text);
}

/** Delete a durable JSON object if present. */
export async function deleteDurableJson(key: string) {
  clearMemory(key);

  if (isDurableRedisConfigured()) {
    await deleteRedisValue(key);
  }

  if (isDurableBlobConfigured()) {
    try {
      const { del } = await import("@vercel/blob");
      await del(blobPathname(key), { token: blobToken() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/not found|404|quota|limit/i.test(message)) {
        console.error(`[durable-json] Blob delete failed (${key}):`, message);
      }
    }
  }

  try {
    await fs.unlink(localPath(key));
  } catch {
    // ignore
  }
}

/** List relative keys under a prefix (e.g. "conversations/"). */
export async function listDurableKeys(prefix: string): Promise<string[]> {
  const cleanPrefix = prefix.replace(/^\/+/, "").replace(/\\/g, "/");
  const keys = new Set<string>();

  if (isDurableRedisConfigured()) {
    const redis = getRedis();
    if (redis) {
      try {
        const indexKey = cleanPrefix.includes("/")
          ? `pp:index:${cleanPrefix.endsWith("/") ? cleanPrefix : `${cleanPrefix}/`}`
          : null;
        const fromIndex = indexKey
          ? await redis.smembers(indexKey)
          : await redis.smembers(REDIS_ALL_KEYS);
        for (const key of fromIndex) {
          if (typeof key === "string" && key.startsWith(cleanPrefix)) {
            keys.add(key);
          }
        }
      } catch (error) {
        console.error(
          `[durable-json] Redis list failed (${cleanPrefix}):`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  if (!isDurableRedisConfigured() && isDurableBlobConfigured()) {
    try {
      const { list } = await import("@vercel/blob");
      const listed = await list({
        prefix: blobPathname(cleanPrefix),
        token: blobToken(),
        limit: 1000,
      });
      for (const blob of listed.blobs) {
        const relative = blob.pathname.replace(
          new RegExp(`^${BLOB_PREFIX}/`),
          "",
        );
        if (relative.startsWith(cleanPrefix)) keys.add(relative);
      }
    } catch (error) {
      console.error(
        `[durable-json] Blob list failed (${cleanPrefix}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  try {
    const dir = localPath(cleanPrefix.replace(/\/$/, "") || ".");
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (entry.endsWith(".json")) {
        keys.add(
          cleanPrefix.endsWith("/")
            ? `${cleanPrefix}${entry}`
            : cleanPrefix
              ? `${cleanPrefix}/${entry}`
              : entry,
        );
      }
    }
  } catch {
    // ignore
  }

  return Array.from(keys).sort();
}

export const DURABLE_ROOT_KEYS = [
  "agents.json",
  "tasks.json",
  "inventory.json",
  "marketing.json",
  "emails.json",
  "social.json",
  "bookkeeping.json",
  "reports.json",
  "job-applications.json",
  "mike-sms-thread.json",
  "mike-alert-state.json",
  "meta-credentials.json",
  "connections.json",
] as const;
