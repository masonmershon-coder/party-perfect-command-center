#!/usr/bin/env node
/**
 * One-time: copy Blob/local JSON into Upstash Redis.
 *
 *   npm run store:migrate
 *
 * Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * (or KV_REST_API_URL + KV_REST_API_TOKEN).
 */
import { Redis } from "@upstash/redis";
import { readFile } from "node:fs/promises";
import path from "node:path";

const BLOB_PREFIX = "party-perfect";
const REDIS_PREFIX = "pp:json:";
const REDIS_ALL_KEYS = "pp:all-keys";

const ROOT_KEYS = [
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
];

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

async function readBlob(key) {
  if (!blobToken) return null;
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(`${BLOB_PREFIX}/${key}`, {
      access: "private",
      token: blobToken,
      useCache: false,
    });
    if (!result?.stream) return "";
    return streamToText(result.stream);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found|404/i.test(message)) return "";
    console.warn(`Blob miss/error for ${key}:`, message);
    return null;
  }
}

async function readLocal(key) {
  try {
    return await readFile(path.join(process.cwd(), "data", key), "utf8");
  } catch {
    return null;
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeRedis(key, data) {
  const index = key.includes("/")
    ? `pp:index:${key.slice(0, key.indexOf("/") + 1)}`
    : null;
  const pipeline = redis.pipeline();
  pipeline.set(`${REDIS_PREFIX}${key}`, data);
  pipeline.sadd(REDIS_ALL_KEYS, key);
  if (index) pipeline.sadd(index, key);
  await pipeline.exec();
}

async function listConversationKeys() {
  const keys = [];
  if (blobToken) {
    try {
      const { list } = await import("@vercel/blob");
      const listed = await list({
        prefix: `${BLOB_PREFIX}/conversations/`,
        token: blobToken,
        limit: 1000,
      });
      for (const blob of listed.blobs) {
        const relative = blob.pathname.replace(
          new RegExp(`^${BLOB_PREFIX}/`),
          "",
        );
        keys.push(relative);
      }
    } catch (error) {
      console.warn(
        "Could not list Blob conversations:",
        error.message || error,
      );
    }
  }
  return keys;
}

const allKeys = [...ROOT_KEYS, ...(await listConversationKeys())];
let copied = 0;
let skipped = 0;

for (const key of allKeys) {
  const existing = await redis.get(`${REDIS_PREFIX}${key}`);
  if (existing != null) {
    console.log(`skip (already in redis): ${key}`);
    skipped += 1;
    continue;
  }

  let text = await readBlob(key);
  if (text == null || !String(text).trim()) {
    text = await readLocal(key);
  }
  if (text == null || !String(text).trim()) {
    console.log(`empty: ${key}`);
    continue;
  }

  const data = parseJson(text);
  if (data == null) {
    console.log(`invalid json: ${key}`);
    continue;
  }

  await writeRedis(key, data);
  console.log(`copied: ${key}`);
  copied += 1;
}

console.log(`\nDone. copied=${copied} skipped=${skipped}`);
