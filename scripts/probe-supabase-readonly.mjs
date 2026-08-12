#!/usr/bin/env node
/** Fetch production read-only DB probe (no local secrets). */
const base = process.env.HEALTH_URL?.replace(/\/api\/health.*/, "") ||
  "https://partyperfect.app";
const url = `${base}/api/health?probe=db`;
const res = await fetch(url, { cache: "no-store" });
const data = await res.json();
console.log(JSON.stringify(data.database ?? data, null, 2));
process.exitCode = data.database?.connection === "ok" ? 0 : 1;
