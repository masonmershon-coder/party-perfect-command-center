#!/usr/bin/env node
/**
 * Quick check: Redis + POR sync readiness on production Command Center.
 */
const url = process.env.HEALTH_URL || "https://partyperfect.app/api/health";

async function main() {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  const lines = [
    `durableStoreMode: ${data.durableStoreMode}`,
    `redisConfigured: ${data.redisConfigured}`,
    `jobsStoreOk: ${data.jobsStoreOk}`,
    `porSyncConfigured: ${data.porSyncConfigured}`,
    `porSnapshotPresent: ${data.porSnapshotPresent}`,
    `porSnapshotStale: ${data.porSnapshotStale}`,
    `porSnapshotVeryStale: ${data.porSnapshotVeryStale}`,
    `porSnapshotFreshness: ${data.porSnapshotFreshness}`,
    `porSyncedAt: ${data.porSyncedAt}`,
    `porSyncedAgo: ${data.porSyncedAgo}`,
  ];
  console.log(lines.join("\n"));

  if (data.durableStoreMode !== "redis") {
    console.error("\nRedis not linked yet. See docs/REDIS_SETUP.md");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
