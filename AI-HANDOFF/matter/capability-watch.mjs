#!/usr/bin/env node
// Capability Watch (Matter policy §4 + §11).
// KNOWING an update exists ≠ APPLYING it.
// Probes registered workers' --version output and records UPDATE_AVAILABLE when
// the observed version differs from the registry. Never installs or upgrades.
//
//   node capability-watch.mjs
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.MATTER_DIR || HERE;
const REGISTRY = path.join(DIR, "WORKER_REGISTRY.json");
const WATCH = path.join(DIR, "CAPABILITY_WATCH.jsonl");

const now = () => new Date().toISOString();

function append(row) {
  mkdirSync(path.dirname(WATCH), { recursive: true });
  appendFileSync(WATCH, JSON.stringify({ at: now(), ...row }) + "\n");
}

function observeVersion(detect) {
  if (!detect) return { ok: false, version: null, reason: "no detect" };
  const argv = Array.isArray(detect) ? detect : String(detect).split(" ");
  const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 20000 });
  if (r.error) return { ok: false, version: null, reason: r.error.code || String(r.error.message) };
  if (r.status !== 0) return { ok: false, version: null, reason: `exit ${r.status}` };
  const version = String(r.stdout || r.stderr || "").trim().split("\n")[0].slice(0, 120) || null;
  return { ok: true, version, reason: "ok" };
}

if (!existsSync(REGISTRY)) {
  console.error("ERR: no WORKER_REGISTRY.json — bootstrap first");
  process.exit(1);
}

const reg = JSON.parse(readFileSync(REGISTRY, "utf8"));
const workers = Object.values(reg.workers || {});
let updates = 0;

for (const w of workers) {
  const obs = observeVersion(w.detect);
  if (!obs.ok) {
    append({
      kind: "WATCH_PROBE_FAILED",
      worker_id: w.worker_id,
      reason: obs.reason,
      registered_version: w.version,
      applied: false,
    });
    console.log(`${w.worker_id.padEnd(17)} PROBE_FAILED  ${obs.reason}`);
    continue;
  }
  if (w.version && obs.version && obs.version !== w.version) {
    append({
      kind: "UPDATE_AVAILABLE",
      worker_id: w.worker_id,
      registered_version: w.version,
      observed_version: obs.version,
      applied: false,
      note: "Recorded only. Matter must evaluate before any install/apply.",
    });
    updates++;
    console.log(`${w.worker_id.padEnd(17)} UPDATE_AVAILABLE  ${w.version} → ${obs.version}`);
  } else {
    append({
      kind: "WATCH_OK",
      worker_id: w.worker_id,
      observed_version: obs.version,
      registered_version: w.version,
      applied: false,
    });
    console.log(`${w.worker_id.padEnd(17)} OK  ${obs.version || "(no version string)"}`);
  }
}

console.log(`\nupdates_available=${updates}  (none applied)`);
