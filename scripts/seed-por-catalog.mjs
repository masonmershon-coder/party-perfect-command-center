#!/usr/bin/env node
/**
 * Seed POR catalog + reservations into durable Redis (prod).
 *
 *   node --env-file=.env.local scripts/seed-por-catalog.mjs
 *
 * Writes:
 *   - data/por-catalog.json      → durable key por-catalog.json  (includes ItemFile.NUM)
 *   - data/por-reservations.json → durable key por-reservations.json
 *
 * Re-run when POR rates/items/reservations change. For live freshness later,
 * add the reservations SELECT to Sync-PorSnapshot.ps1 (see AVAILABILITY_BY_DATE_SPEC).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "@upstash/redis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
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

const redis = new Redis({ url, token });

async function seedJson(fileRel, durableKey, verify) {
  const file = resolve(ROOT, fileRel);
  if (!existsSync(file)) {
    console.error(`Missing ${fileRel}`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(file, "utf8"));
  verify(data, fileRel);

  const redisKey = `${REDIS_JSON_PREFIX}${durableKey}`;
  console.log(`Seeding ${fileRel} → Redis ${redisKey}`);

  const pipeline = redis.pipeline();
  pipeline.set(redisKey, data);
  pipeline.sadd(REDIS_ALL_KEYS, durableKey);
  await pipeline.exec();

  const check = await redis.get(redisKey);
  return { durableKey, redisKey, check, data };
}

const catalogSeed = await seedJson(
  "data/por-catalog.json",
  "por-catalog.json",
  (catalog, path) => {
    if (!Array.isArray(catalog.items) || catalog.items.length === 0) {
      throw new Error(`${path} has no items.`);
    }
    const withNum = catalog.items.filter((i) => i?.num != null && String(i.num).trim()).length;
    if (withNum < catalog.items.length * 0.9) {
      throw new Error(
        `${path}: only ${withNum}/${catalog.items.length} items have num — re-export before seeding.`,
      );
    }
  },
);

const catalogCount = Array.isArray(catalogSeed.check?.items)
  ? catalogSeed.check.items.length
  : 0;
if (catalogCount < 1000) {
  console.error(`Catalog seed verify failed — Redis has ${catalogCount} items.`);
  process.exit(1);
}
const sampleNum = catalogSeed.check.items.find((i) => i?.num)?.num;

const resSeed = await seedJson(
  "data/por-reservations.json",
  "por-reservations.json",
  (state, path) => {
    if (!Array.isArray(state.reservations) || state.reservations.length === 0) {
      throw new Error(`${path} has no reservations.`);
    }
  },
);

const resCount = Array.isArray(resSeed.check?.reservations)
  ? resSeed.check.reservations.length
  : 0;
if (resCount < 100) {
  console.error(
    `Reservations seed verify failed — Redis has ${resCount} rows.`,
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      catalog: {
        durableKey: "por-catalog.json",
        items: catalogCount,
        activeItems: catalogSeed.check.activeItems,
        sampleNum,
        syncedAt: catalogSeed.check.syncedAt,
      },
      reservations: {
        durableKey: "por-reservations.json",
        count: resCount,
        syncedAt: resSeed.check.syncedAt,
        source: resSeed.check.source,
      },
    },
    null,
    2,
  ),
);
