#!/usr/bin/env node
/**
 * Seed the full POR active catalog into durable Redis for Madison (prod).
 *
 *   node --env-file=.env.local scripts/seed-por-catalog.mjs
 *
 * Reads data/por-catalog.json (committed) and writes durable key `por-catalog.json`.
 * Re-run whenever POR rates/items change.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FILE = resolve(ROOT, "data/por-catalog.json");
const DURABLE_KEY = "por-catalog.json";
const REDIS_JSON_PREFIX = "pp:json:";
const REDIS_ALL_KEYS = "pp:json:keys";

const url =
  process.env.UPSTASH_REDIS_REST_URL?.trim() ||
  process.env.KV_REST_API_URL?.trim();
const token =
  process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
  process.env.KV_REST_API_TOKEN?.trim();

if (!url || !token) {
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_*).",
  );
  process.exit(1);
}

const raw = readFileSync(FILE, "utf8");
const catalog = JSON.parse(raw);

if (!Array.isArray(catalog.items) || catalog.items.length === 0) {
  console.error("data/por-catalog.json has no items.");
  process.exit(1);
}

const redis = new Redis({ url, token });
const redisKey = `${REDIS_JSON_PREFIX}${DURABLE_KEY}`;

console.log(
  `Seeding ${catalog.items.length} items (activeItems=${catalog.activeItems}) → Redis ${redisKey}`,
);

const pipeline = redis.pipeline();
pipeline.set(redisKey, catalog);
pipeline.sadd(REDIS_ALL_KEYS, DURABLE_KEY);
await pipeline.exec();

const check = await redis.get(redisKey);
const count = Array.isArray(check?.items) ? check.items.length : 0;
if (count < 1000) {
  console.error(`Seed verify failed — Redis has ${count} items.`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      durableKey: DURABLE_KEY,
      redisKey,
      items: count,
      activeItems: check.activeItems,
      syncedAt: check.syncedAt,
      source: check.source,
    },
    null,
    2,
  ),
);
