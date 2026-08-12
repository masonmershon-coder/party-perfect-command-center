#!/usr/bin/env node
// Persistent-watcher TICK — DETERMINISTIC. Invoked by launchd on queue change + a slow
// heartbeat. Not an AI. It: takes a run-lock (no duplicate execution), runs the deterministic
// dispatcher once (which invokes a real agent ONLY when there is actionable work AND its
// runtime is available), maintains a heartbeat, backs off blocked tasks, and escalates genuine
// owner-approval blockers instead of retrying forever. Spends agent tokens only on real work.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const flags = Object.fromEntries(process.argv.slice(2).filter((x) => x.startsWith("--")).map((x) => { const [k, ...v] = x.slice(2).split("="); return [k, v.join("=")]; }));
const CP = flags.cp || path.join(HERE, "..");
const REPO = flags.repo || "/Users/mikeai/grok-dashboard";
const MAP = flags.map || "cursor:cursor-local";
const LOCK = path.join(HERE, ".dispatch.lock");
const BACKOFF = path.join(HERE, ".backoff.json");
const cp = (...a) => spawnSync("node", [path.join(CP, "control-plane.mjs"), ...a], { encoding: "utf8" });

// --- run-lock (atomic mkdir); stale after 10 min ---
try { mkdirSync(LOCK); } catch {
  try { const age = Date.now() - Number(readFileSync(path.join(LOCK, "ts"), "utf8")); if (age < 600000) { console.log("tick: locked, skip"); process.exit(0); } } catch {}
}
writeFileSync(path.join(LOCK, "ts"), String(Date.now()));

try {
  cp("heartbeat", "dispatcher", "TICK");
  const r = spawnSync("node", [path.join(HERE, "local-dispatcher.mjs"), `--cp=${CP}`, `--repo=${REPO}`, `--map=${MAP}`, "--max=8"], { encoding: "utf8", env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` } });
  const out = (r.stdout || "") + (r.stderr || "");
  process.stdout.write(out);

  // backoff + escalation for owner-gated blocks (e.g. runtime not authed)
  const bo = existsSync(BACKOFF) ? JSON.parse(readFileSync(BACKOFF, "utf8")) : {};
  const blocked = out.match(/BLOCKED ([A-Z0-9-]+)/);
  if (blocked) {
    const id = blocked[1]; bo[id] = (bo[id] || 0) + 1;
    if (bo[id] >= 3 && /install|authenticate|owner/i.test(out)) {
      cp("block", id, "dispatcher", "runtime unavailable (install/auth) — owner action required", "--escalate=mason");
      console.log(`tick: escalated ${id} to Mason after ${bo[id]} blocked attempts`);
    }
  } else { for (const k of Object.keys(bo)) delete bo[k]; } // cleared when unblocked
  writeFileSync(BACKOFF, JSON.stringify(bo));
  cp("dashboard"); // keep the human dashboard live (deterministic render, no LLM)
  cp("heartbeat", "dispatcher", "IDLE");
} finally {
  try { rmSync(LOCK, { recursive: true, force: true }); } catch {}
}
