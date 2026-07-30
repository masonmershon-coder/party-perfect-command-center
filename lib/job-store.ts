import {
  durableStoreMode,
  getDurableRedis,
  isDurableRedisConfigured,
  readDurableJson,
  writeDurableJson,
} from "./durable-json";
import type { JobApplication } from "./jobs";

/** Legacy single-document key (Blob / older Redis json: prefix). */
const LEGACY_KEY = "job-applications.json";

/** Append-only Redis keys — one application per key. */
const APP_KEY_PREFIX = "pp:job-app:";
const APP_INDEX = "pp:job-app-index";
const MAX_APPLICATIONS = 500;

function appRedisKey(id: string) {
  return `${APP_KEY_PREFIX}${id}`;
}

function scoreFor(app: JobApplication) {
  const ms = Date.parse(app.submittedAt);
  return Number.isFinite(ms) ? ms : Date.now();
}

function coerceApplication(value: unknown): JobApplication | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<JobApplication>;
  if (typeof row.id !== "string" || !row.id.trim()) return null;
  if (typeof row.fullName !== "string") return null;
  return row as JobApplication;
}

async function readLegacyArray(): Promise<JobApplication[]> {
  const data = await readDurableJson<JobApplication[]>(LEGACY_KEY, []);
  return Array.isArray(data) ? data.filter((row) => coerceApplication(row)) : [];
}

/**
 * One-time: copy legacy job-applications.json array into append-only Redis keys.
 * Safe to re-run (skips IDs already present).
 */
export async function migrateLegacyJobApplicationsToAppendOnly(): Promise<{
  migrated: number;
  skipped: number;
}> {
  const redis = getDurableRedis();
  if (!redis) return { migrated: 0, skipped: 0 };

  const legacy = await readLegacyArray();
  let migrated = 0;
  let skipped = 0;

  for (const app of legacy) {
    const key = appRedisKey(app.id);
    const existing = await redis.get(key);
    if (existing != null) {
      skipped += 1;
      continue;
    }
    await redis.set(key, app);
    await redis.zadd(APP_INDEX, { score: scoreFor(app), member: app.id });
    migrated += 1;
  }

  return { migrated, skipped };
}

async function listFromRedis(): Promise<JobApplication[]> {
  const redis = getDurableRedis();
  if (!redis) return [];

  let ids = (await redis.zrange(APP_INDEX, 0, MAX_APPLICATIONS - 1, {
    rev: true,
  })) as string[];

  if (!ids.length) {
    const { migrated } = await migrateLegacyJobApplicationsToAppendOnly();
    if (migrated > 0) {
      ids = (await redis.zrange(APP_INDEX, 0, MAX_APPLICATIONS - 1, {
        rev: true,
      })) as string[];
    }
  }

  if (!ids.length) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.get(appRedisKey(id));
  }
  const rows = await pipeline.exec();
  const applications: JobApplication[] = [];
  for (const row of rows ?? []) {
    const app = coerceApplication(row);
    if (app) applications.push(app);
  }
  return applications;
}

async function saveToRedis(application: JobApplication): Promise<void> {
  const redis = getDurableRedis();
  if (!redis) {
    throw new Error(
      "Upstash Redis is required to save applications. Link Redis in Vercel Storage.",
    );
  }

  const key = appRedisKey(application.id);
  await redis.set(key, application);
  await redis.zadd(APP_INDEX, {
    score: scoreFor(application),
    member: application.id,
  });

  // Cap index size — drop oldest beyond MAX_APPLICATIONS
  const count = await redis.zcard(APP_INDEX);
  if (count > MAX_APPLICATIONS) {
    const overflow = (await redis.zrange(
      APP_INDEX,
      0,
      count - MAX_APPLICATIONS - 1,
    )) as string[];
    if (overflow.length) {
      const trim = redis.pipeline();
      for (const id of overflow) {
        trim.del(appRedisKey(id));
        trim.zrem(APP_INDEX, id);
      }
      await trim.exec();
    }
  }

  // Verify durable write
  const stored = await redis.get(key);
  if (stored == null) {
    throw new Error("Application write verification failed — Redis read missed.");
  }
}

async function deleteFromRedis(id: string): Promise<boolean> {
  const redis = getDurableRedis();
  if (!redis) return false;
  const existing = await redis.get(appRedisKey(id));
  if (existing == null) return false;
  await redis.del(appRedisKey(id));
  await redis.zrem(APP_INDEX, id);
  return true;
}

/** Prefer append-only Redis; fall back to legacy JSON array (local/Blob). */
export async function readJobApplicationsStore(): Promise<JobApplication[]> {
  if (isDurableRedisConfigured()) {
    return listFromRedis();
  }
  return readLegacyArray();
}

/**
 * Replace full store — only used for Blob/local fallback bulk writes.
 * Prefer {@link saveJobApplication} for new submits.
 */
export async function writeJobApplicationsStore(
  applications: JobApplication[],
) {
  await writeDurableJson(LEGACY_KEY, applications.slice(0, MAX_APPLICATIONS));
}

/** Append one application (Redis primary). Throws if durable write fails. */
export async function saveJobApplication(
  application: JobApplication,
): Promise<void> {
  if (isDurableRedisConfigured()) {
    await saveToRedis(application);
    return;
  }

  // Local/Blob fallback — still verify by rewriting array
  const existing = await readLegacyArray();
  existing.unshift(application);
  await writeJobApplicationsStore(existing);
}

export async function removeJobApplication(id: string): Promise<boolean> {
  if (isDurableRedisConfigured()) {
    const removed = await deleteFromRedis(id);
    if (removed) return true;
    // Also scrub legacy array if present
  }

  const existing = await readLegacyArray();
  const next = existing.filter((app) => app.id !== id);
  if (next.length === existing.length) return false;
  await writeJobApplicationsStore(next);
  return true;
}

export function jobStoreMode() {
  return durableStoreMode();
}

export function jobsStoreRequiresRedis() {
  return (
    process.env.VERCEL === "1" ||
    process.env.VERCEL === "true" ||
    isDurableRedisConfigured()
  );
}
