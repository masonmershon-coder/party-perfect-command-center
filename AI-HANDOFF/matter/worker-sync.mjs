#!/usr/bin/env node
// Worker startup sync (Matter policy §9).
// READ policy → heartbeat → probe → ACK current policy → then work.
//
//   node worker-sync.mjs <worker_id> [--version '...'] [--caps '{"coding":0.9}']
//   node worker-sync.mjs --all
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { policy, heartbeat, ack, probe } from "./matter-registry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = path.join(process.env.MATTER_DIR || HERE, "WORKER_REGISTRY.json");

function loadWorkers() {
  if (!existsSync(REGISTRY)) return [];
  const reg = JSON.parse(readFileSync(REGISTRY, "utf8"));
  return Object.keys(reg.workers || {});
}

function versionFromProbe(detect) {
  if (!detect) return null;
  const argv = Array.isArray(detect) ? detect : String(detect).split(" ");
  const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", timeout: 20000 });
  if (r.error || r.status !== 0) return null;
  return String(r.stdout || r.stderr || "").trim().split("\n")[0].slice(0, 120) || null;
}

function syncOne(worker_id, opts = {}) {
  const p = policy();
  console.log(`[${worker_id}] policy ${p.version}`);
  const reg = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const w = reg.workers?.[worker_id];
  if (!w) {
    console.error(`ERR: unknown worker ${worker_id} — run bootstrap-workers.mjs first`);
    process.exit(1);
  }
  const version = opts.version || versionFromProbe(w.detect) || w.version || null;
  const caps = opts.caps || {};
  const hb = heartbeat(worker_id, { version, capabilities: caps });
  const pr = probe(worker_id);
  const a = ack(worker_id, Object.keys({ ...w.capabilities, ...caps }));
  console.log(JSON.stringify({ worker_id, heartbeat_changes: hb.changes.length, probe: pr[0], ack: a }, null, 2));
}

const args = process.argv.slice(2);
if (args[0] === "--all") {
  for (const id of loadWorkers()) syncOne(id);
} else if (args[0]) {
  let version = null;
  let caps = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--version") version = args[++i];
    else if (args[i] === "--caps") caps = JSON.parse(args[++i]);
  }
  syncOne(args[0], { version, caps });
} else {
  console.log("usage: node worker-sync.mjs <worker_id>|--all [--version V] [--caps JSON]");
  process.exit(2);
}
