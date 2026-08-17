#!/usr/bin/env node
// MATTER WATCHDOG — deterministic supervisor. Calls no model. (P0-3, P0-5)
//
// UNARMED BY DEFAULT. Without an explicit arm it only OBSERVES: it never restarts a service,
// never mutates the queue, never sends an alert. Arming is a separate, deliberate act because
// the machine's launchd scheduling is currently broken (see MATTER_P0_STATUS.md) and a
// supervisor that cannot itself be supervised must not be silently taking actions.
//
//   node watchdog.mjs --once            one observation pass, human-readable
//   node watchdog.mjs --once --json     same, machine-readable
//   node watchdog.mjs --daemon          internal loop (REQUIRES arming)
//   node watchdog.mjs --arm-status      show whether it is armed and why
//
// ARMING: create the file ARMED next to this script, or set MATTER_WATCHDOG_ARMED=1.
// Arm ONLY after macOS background permission is confirmed and the launchd control test passes.
//
// WHY A DAEMON, NOT A PERIODIC JOB: on this Mac launchd fires neither StartInterval nor
// RunAtLoad nor KeepAlive (proven with a minimal control plist). Long-running processes DO
// survive — the iMessage bridge and OpenClaw gateway have run for days. So the reliable shape
// here is one persistent process with its own timer, which launchd only needs to start once.
import { readFileSync, existsSync, appendFileSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const DIR = process.env.MATTER_WATCHDOG_DIR || HERE;
const INCIDENTS = path.join(DIR, "INCIDENTS.jsonl");
const ARMED_FILE = path.join(DIR, "ARMED");

const now = () => new Date().toISOString();
const readJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };
const append = (f, o) => { mkdirSync(path.dirname(f), { recursive: true }); appendFileSync(f, JSON.stringify({ at: now(), ...o }) + "\n"); };
const readLines = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const minutesSince = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 60000 : Infinity);

export const isArmed = () => process.env.MATTER_WATCHDOG_ARMED === "1" || existsSync(ARMED_FILE);

// ---- health model (P0-5) ------------------------------------------------
export const HEALTH = ["HEALTHY", "STALE", "DEGRADED", "OFFLINE"];
/**
 * One rule for every heartbeat-bearing thing. `stale` and `offline` are thresholds in minutes.
 * Absence of a heartbeat is OFFLINE, never "assumed fine" — the audit found 2–5 day stale
 * heartbeats sitting unnoticed precisely because nothing classified them.
 */
export function healthFor(lastSeenIso, { staleMin = 60, offlineMin = 180, degraded = false } = {}) {
  const age = minutesSince(lastSeenIso);
  if (!Number.isFinite(age)) return { health: "OFFLINE", age_minutes: null, reason: "no heartbeat ever recorded" };
  if (age > offlineMin) return { health: "OFFLINE", age_minutes: Math.round(age), reason: `no heartbeat for ${Math.round(age)}m` };
  if (age > staleMin) return { health: "STALE", age_minutes: Math.round(age), reason: `heartbeat ${Math.round(age)}m old` };
  if (degraded) return { health: "DEGRADED", age_minutes: Math.round(age), reason: "reporting but impaired" };
  return { health: "HEALTHY", age_minutes: Math.round(age) };
}

// ---- service probes (deterministic; no LLM decides whether a process is alive) ----
const pgrepAlive = (pattern) => {
  const r = spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" });
  const pids = (r.stdout || "").trim().split("\n").filter(Boolean);
  return { alive: pids.length > 0, pids };
};
const httpOk = (url, timeoutMs = 4000) => {
  const r = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", String(Math.ceil(timeoutMs / 1000)), url], { encoding: "utf8" });
  const code = (r.stdout || "").trim();
  return { ok: code.startsWith("2"), code: code || "no response" };
};
const fileAgeMinutes = (p) => { try { return (Date.now() - statSync(p).mtimeMs) / 60000; } catch { return Infinity; } };

/**
 * The services Matter depends on. `restart` is recorded but only EXECUTED when armed.
 * Each entry declares how to observe it — never an assumption that it is running.
 */
export const SERVICES = [
  {
    id: "matter-scheduler", critical: true,
    observe: () => {
      const log = path.join(HANDOFF, "matter", ".logs", "matter.out.log");
      const age = fileAgeMinutes(log);
      // Expected to tick every 10 min; allow generous slack before calling it down.
      return { up: age < 30, detail: Number.isFinite(age) ? `last tick ${Math.round(age)}m ago` : "no log", age_minutes: age };
    },
    restart: ["launchctl", "kickstart", "-p", `gui/${process.getuid()}/com.partyperfect.matter`],
  },
  {
    id: "intake-worker", critical: true,
    observe: () => { const h = httpOk("http://localhost:8788/health"); return { up: h.ok, detail: `health ${h.code}` }; },
    restart: ["launchctl", "kickstart", "-p", `gui/${process.getuid()}/app.matter.intake`],
  },
  {
    id: "imessage-bridge", critical: true,
    observe: () => { const p = pgrepAlive("imessage-bridge.mjs"); return { up: p.alive, detail: p.alive ? `pid ${p.pids.join(",")}` : "not running" }; },
    restart: null, // runs in Mike's own macOS session; restarting it is not the watchdog's business
  },
  {
    id: "openclaw-gateway", critical: false,
    observe: () => { const p = pgrepAlive("openclaw"); return { up: p.alive, detail: p.alive ? `pid ${p.pids[0]}` : "not running" }; },
    restart: ["launchctl", "kickstart", "-p", `gui/${process.getuid()}/ai.openclaw.gateway`],
  },
];

// ---- flap control -------------------------------------------------------
const RESTART_WINDOW_MIN = 60;
const MAX_RESTARTS_IN_WINDOW = 3;
/** A service restarted too often is flapping: stop restarting and escalate to a human. */
export function isFlapping(service_id) {
  const recent = readLines(INCIDENTS).filter((i) =>
    i.service === service_id && i.action === "RESTART_ATTEMPTED" && minutesSince(i.at) <= RESTART_WINDOW_MIN);
  return { flapping: recent.length >= MAX_RESTARTS_IN_WINDOW, attempts: recent.length };
}

// ---- the observation pass ----------------------------------------------
export function observe() {
  const armed = isArmed();
  const report = { at: now(), armed, services: [], workers: [], queue: null, alerts: [], actions: [] };

  // 1. services
  for (const svc of SERVICES) {
    let o; try { o = svc.observe(); } catch (e) { o = { up: false, detail: `probe error: ${String(e.message).slice(0, 60)}` }; }
    const entry = { id: svc.id, critical: svc.critical, up: o.up, detail: o.detail, health: o.up ? "HEALTHY" : "OFFLINE" };
    if (!o.up) {
      const flap = isFlapping(svc.id);
      entry.flapping = flap.flapping;
      entry.restart_available = Boolean(svc.restart);
      if (flap.flapping) {
        entry.recommendation = `FLAPPING (${flap.attempts} restarts in ${RESTART_WINDOW_MIN}m) — escalate to owner, do not restart again`;
        report.alerts.push({ level: "ALERT", service: svc.id, reason: entry.recommendation });
      } else if (svc.restart) {
        entry.recommendation = `restart via: ${svc.restart.join(" ")}`;
        report.actions.push({ service: svc.id, action: "RESTART", command: svc.restart, executed: false });
      } else {
        entry.recommendation = "no automatic restart defined — owner action";
        report.alerts.push({ level: "ALERT", service: svc.id, reason: `${svc.id} down and has no automatic restart` });
      }
    }
    report.services.push(entry);
  }

  // 2. worker heartbeat staleness (P0-5) — from BOTH registries that exist today
  const reg = readJson(path.join(HERE, "WORKER_REGISTRY.json"), { workers: {} }).workers || {};
  for (const w of Object.values(reg)) {
    const h = healthFor(w.last_heartbeat, { staleMin: 60, offlineMin: 180, degraded: w.available === false });
    report.workers.push({ worker_id: w.worker_id, source: "matter-registry", version: w.version, available: w.available, ...h });
  }
  const legacy = readJson(path.join(HANDOFF, "HEARTBEATS.json"), {});
  for (const [id, v] of Object.entries(legacy)) {
    const h = healthFor(v.last_seen, { staleMin: 60, offlineMin: 180 });
    report.workers.push({ worker_id: id, source: "legacy-heartbeats", state: v.state, ...h });
  }
  for (const w of report.workers) {
    if (w.health === "OFFLINE" || w.health === "STALE")
      report.alerts.push({ level: w.health === "OFFLINE" ? "ALERT" : "WARN", worker: w.worker_id, reason: w.reason });
  }

  // 3. queue + leases + DLQ — read-only unless armed
  try {
    const execPath = path.join(HERE, "execution.mjs");
    if (existsSync(execPath)) {
      const r = spawnSync("node", [execPath, "status"], { encoding: "utf8" });
      const q = JSON.parse(r.stdout || "{}");
      report.queue = {
        total: q.total ?? 0, by_state: q.byState ?? {},
        dead_letter_count: q.dead_letter_count ?? 0,
        expired_leases_pending_reclaim: q.expired_leases_pending_reclaim ?? 0,
        oldest_queued_age_minutes: q.oldest_queued_age_minutes ?? 0,
        abandoned: q.abandoned ?? [],
      };
      if (report.queue.expired_leases_pending_reclaim > 0) {
        report.actions.push({ action: "RECLAIM_EXPIRED_LEASES", count: report.queue.expired_leases_pending_reclaim, executed: false });
      }
      // The invariant. If this ever trips it is the highest-severity finding the watchdog can make.
      if (report.queue.abandoned.length)
        report.alerts.push({ level: "CRITICAL", reason: `ABANDONED TASKS: ${report.queue.abandoned.join(", ")}` });
      if (report.queue.dead_letter_count > 0)
        report.alerts.push({ level: "WARN", reason: `${report.queue.dead_letter_count} task(s) in the dead-letter queue awaiting review` });
      if (report.queue.oldest_queued_age_minutes > 1440)
        report.alerts.push({ level: "WARN", reason: `oldest queued task is ${Math.round(report.queue.oldest_queued_age_minutes / 60)}h old` });
    }
  } catch (e) { report.queue = { error: String(e.message).slice(0, 120) }; }

  // 4. overall verdict
  const criticalDown = report.services.filter((s) => s.critical && !s.up).map((s) => s.id);
  report.matter_status = report.alerts.some((a) => a.level === "CRITICAL") ? "DOWN"
    : criticalDown.length ? "DEGRADED"
    : report.alerts.length ? "DEGRADED" : "HEALTHY";
  report.critical_services_down = criticalDown;
  return report;
}

/**
 * Act on an observation — ONLY when armed. Bounded restart, then verify recovery, and alert
 * only if recovery fails or the service is flapping (P0-3).
 */
export function act(report) {
  if (!report.armed) return { executed: [], note: "UNARMED — observation only, no action taken" };
  const executed = [];
  for (const a of report.actions) {
    if (a.action === "RESTART") {
      append(INCIDENTS, { service: a.service, action: "RESTART_ATTEMPTED", command: a.command.join(" ") });
      const r = spawnSync(a.command[0], a.command.slice(1), { encoding: "utf8", timeout: 30000 });
      const svc = SERVICES.find((s) => s.id === a.service);
      let recovered = false;
      try { recovered = svc.observe().up; } catch { recovered = false; }
      append(INCIDENTS, { service: a.service, action: recovered ? "RECOVERED" : "RECOVERY_FAILED", exit: r.status });
      executed.push({ service: a.service, recovered });
      if (!recovered) append(INCIDENTS, { level: "ALERT", service: a.service, action: "ESCALATE", reason: "restart did not restore service" });
    }
    if (a.action === "RECLAIM_EXPIRED_LEASES") {
      const r = spawnSync("node", [path.join(HERE, "execution.mjs"), "reclaim"], { encoding: "utf8" });
      append(INCIDENTS, { action: "RECLAIMED", detail: (r.stdout || "").trim().slice(0, 200) });
      executed.push({ action: "RECLAIM", output: (r.stdout || "").trim().slice(0, 120) });
    }
  }
  return { executed };
}

function render(r) {
  const L = [];
  L.push(`MATTER: ${r.matter_status}${r.armed ? "" : "   [WATCHDOG UNARMED — observation only]"}`);
  L.push("");
  L.push("SERVICES");
  for (const s of r.services)
    L.push(`  ${s.up ? "UP  " : "DOWN"} ${s.id.padEnd(20)} ${s.detail}${s.recommendation ? `\n         → ${s.recommendation}` : ""}`);
  L.push("");
  L.push("WORKERS");
  for (const w of r.workers)
    L.push(`  ${String(w.health).padEnd(8)} ${w.worker_id.padEnd(16)} ${(w.source || "").padEnd(18)} ${w.age_minutes === null ? "never" : w.age_minutes + "m"}${w.version ? "  " + w.version : ""}`);
  if (r.queue && !r.queue.error) {
    L.push("");
    L.push("QUEUE");
    L.push(`  total ${r.queue.total}  dead-letter ${r.queue.dead_letter_count}  expired-leases ${r.queue.expired_leases_pending_reclaim}  oldest-queued ${r.queue.oldest_queued_age_minutes}m`);
    L.push(`  abandoned: ${r.queue.abandoned.length ? r.queue.abandoned.join(", ") : "none  ✓ invariant holds"}`);
  }
  if (r.alerts.length) {
    L.push("");
    L.push("ALERTS");
    // Name the subject — nine identical "no heartbeat" lines are unreadable and were part of
    // why staleness went unnoticed in the first place.
    for (const a of r.alerts) {
      const subject = a.worker ? `worker ${a.worker}` : a.service ? `service ${a.service}` : "queue";
      L.push(`  ${a.level.padEnd(8)} ${subject.padEnd(28)} ${a.reason}`);
    }
  }
  if (r.actions.length) {
    L.push("");
    L.push(`PENDING ACTIONS (${r.armed ? "will execute" : "NOT executed — unarmed"})`);
    for (const a of r.actions) L.push(`  ${a.action} ${a.service || ""} ${a.count ? "x" + a.count : ""}`);
  }
  return L.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--arm-status")) {
    console.log(`armed: ${isArmed()}`);
    console.log(isArmed() ? "  (ARMED file present or MATTER_WATCHDOG_ARMED=1)"
      : `  to arm AFTER macOS background permission is confirmed and the launchd control test passes:\n    touch ${ARMED_FILE}`);
    process.exit(0);
  }
  const r = observe();
  if (r.armed) { const a = act(r); r.acted = a; }
  if (argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(render(r));
    if (!r.armed) console.log("\n(unarmed: no service was restarted and no queue state was modified)");
  }
  if (argv.includes("--daemon")) {
    if (!isArmed()) { console.error("\nREFUSING to daemonize while UNARMED. Arm deliberately after the control test passes."); process.exit(3); }
    const everyMs = Number(process.env.MATTER_WATCHDOG_INTERVAL_SEC || 120) * 1000;
    setInterval(() => { const rr = observe(); act(rr); append(INCIDENTS, { action: "PASS", matter_status: rr.matter_status, alerts: rr.alerts.length }); }, everyMs);
  }
}
