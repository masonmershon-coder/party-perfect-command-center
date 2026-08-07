#!/usr/bin/env node
/**
 * Migrate legacy job-applications.json into append-only Redis keys.
 *
 *   npm run jobs:migrate
 *
 * Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * (or KV_REST_API_URL + KV_REST_API_TOKEN).
 * Optionally BLOB_READ_WRITE_TOKEN to pull legacy Blob array first.
 */
import { Redis } from "@upstash/redis";

const BLOB_PREFIX = "party-perfect";
const REDIS_JSON_PREFIX = "pp:json:";
const LEGACY_KEY = "job-applications.json";
const APP_KEY_PREFIX = "pp:job-app:";
const APP_INDEX = "pp:job-app-index";

const url =
  process.env.UPSTASH_REDIS_REST_URL?.trim() ||
  process.env.KV_REST_API_URL?.trim();
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
  process.env.KV_REST_API_TOKEN?.trim();
const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();

if (!url || !token) {
  console.error("Missing Upstash Redis REST URL/token in env.");
  process.exit(1);
}

const redis = new Redis({ url, token });

async function streamToText(stream) {
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

async function readLegacyArray() {
  const fromRedis = await redis.get(`${REDIS_JSON_PREFIX}${LEGACY_KEY}`);
  if (Array.isArray(fromRedis)) return fromRedis;
  if (typeof fromRedis === "string") {
    try {
      const parsed = JSON.parse(fromRedis);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }

  if (!blobToken) return [];
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(`${BLOB_PREFIX}/${LEGACY_KEY}`, {
      access: "private",
      token: blobToken,
      useCache: false,
    });
    const text = await streamToText(result?.stream ?? null);
    if (!text.trim()) return [];
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Blob legacy read failed:", error.message || error);
    return [];
  }
}

const legacy = await readLegacyArray();
console.log(`Found ${legacy.length} legacy application(s).`);

let migrated = 0;
let skipped = 0;

for (const app of legacy) {
  if (!app?.id) {
    skipped += 1;
    continue;
  }
  const key = `${APP_KEY_PREFIX}${app.id}`;
  const existing = await redis.get(key);
  if (existing != null) {
    console.log(`skip: ${app.id}`);
    skipped += 1;
    continue;
  }
  const score = Date.parse(app.submittedAt) || Date.now();
  await redis.set(key, app);
  await redis.zadd(APP_INDEX, { score, member: app.id });
  console.log(`migrated: ${app.id} (${app.fullName || "unnamed"})`);
  migrated += 1;
}

console.log(`\nDone. migrated=${migrated} skipped=${skipped}`);
console.log(
  "Next: confirm https://partyperfectcommand.app/api/health shows durableStoreMode=redis and jobsStoreOk=true",
);
