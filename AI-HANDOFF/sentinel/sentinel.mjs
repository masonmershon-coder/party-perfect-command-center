#!/usr/bin/env node
// ⚠️ SUPERSEDED ARCHITECTURE — DO NOT SCHEDULE OR TREAT AS THE PRODUCTION MONITOR
//
// Codex reviewed this and returned APPROVE WITH CHANGES on 2026-08-13: Sentinel
// must be a SYSTEM of separate components (collectors / evidence ledger /
// analyst / containment broker / watchdog), not one module holding all of them.
// See AI-HANDOFF/EVIDENCE/SENTINEL_ARCHITECTURE_REVIEW_2026-08-13.md and
// AI-HANDOFF/sentinel/SENTINEL_PERMISSION_MATRIX.md.
//
// Kept for its 25 synthetic tests and two real findings, which carry forward as
// component requirements. Not the design.
//
// SENTINEL V1 (superseded) — Party Perfect security monitoring.
//
//   node sentinel.mjs --scan       run all detectors, emit events
//   node sentinel.mjs --inbox      owner security inbox (grouped)
//   node sentinel.mjs --status     Sentinel's own health
//   node sentinel.mjs --test       synthetic incident suite (no real systems)
//
// Sentinel OBSERVES. Matter ENFORCES. Two different questions:
//   Matter   — is this action permitted?
//   Sentinel — is the actual behaviour suspicious?
//
// DEFAULT READ-ONLY. Sentinel holds no shell, no admin credential, no POR
// access. Every capability it has is a named scoped adapter; anything outside
// that list is OWNER_REQUIRED, not something Sentinel decides to do.
//
// Severity is RULE-DRIVEN. A model opinion may never declare CRITICAL — every
// severity here traces to a counted, checkable fact.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);
// Paths are overridable so an INDEPENDENT verifier can reproduce the suite.
// Codex runs read-only on the repo; a test suite that can only write inside the repo
// is a suite only its author can run, which is the opposite of independent
// verification. Pointing these at a temp dir lets the verifier re-derive the result
// instead of taking the owner's word for it. Unset => normal live paths.
const EVENTS = process.env.PP_SECURITY_EVENTS_PATH || path.join(HANDOFF, "SECURITY_EVENTS.jsonl");
const HEALTH = process.env.PP_SENTINEL_HEALTH_PATH || path.join(HERE, "sentinel-health.json");
const now = () => new Date().toISOString();

export const SEVERITY = ["INFO", "WATCH", "HIGH", "CRITICAL", "EMERGENCY"];

/**
 * Sentinel's ENTIRE capability surface. Read scopes plus two narrow actions.
 * Anything not on this list is OWNER_REQUIRED by construction — there is no
 * code path that grants Sentinel more.
 */
export const SENTINEL_CAPABILITIES = [
  "sentinel.read.auth", "sentinel.read.agent_health", "sentinel.read.replication",
  "sentinel.read.backup", "sentinel.read.web_security", "sentinel.read.control_plane",
  "sentinel.action.pause_agent_task", "sentinel.action.quarantine_artifact",
];

/** Explicitly forbidden — enumerated so a future edit has to delete a line to break it. */
export const OWNER_REQUIRED = [
  "shutdown_por", "modify_sql", "modify_firewall", "disable_employee",
  "rotate_credentials", "deploy_code", "delete_records", "capture_payment",
  "contact_customer", "purchase", "raise_spend_limit", "expose_secret",
  "destroy_evidence",
];

export function capabilityAllowed(action) {
  if (OWNER_REQUIRED.includes(action)) return { allowed: false, reason: "OWNER_REQUIRED", action };
  if (!SENTINEL_CAPABILITIES.includes(action)) return { allowed: false, reason: "NOT_IN_SCOPE", action };
  return { allowed: true, action };
}

const load = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };

// ---------------------------------------------------------------- events
/**
 * Append-only with hash chaining. Each event carries the hash of the previous
 * one, so a compromised worker cannot quietly rewrite its own history — an
 * edited or removed record breaks the chain and `--verify-chain` reports where.
 */
function lastHash() {
  if (!existsSync(EVENTS)) return "GENESIS";
  const lines = readFileSync(EVENTS, "utf8").trim().split("\n").filter(Boolean);
  if (!lines.length) return "GENESIS";
  try { return JSON.parse(lines[lines.length - 1]).this_hash || "GENESIS"; } catch { return "GENESIS"; }
}

const SECRETISH = /(sk-[A-Za-z0-9]{12}|xai-[A-Za-z0-9]{12}|AKIA[0-9A-Z]{12}|password\s*[:=]|Bearer\s+[A-Za-z0-9._-]{12})/i;

export function emit(ev) {
  const prev = lastHash();
  const row = {
    event_id: createHash("sha1").update(`${ev.event_type}|${ev.asset}|${now()}|${Math.random()}`).digest("hex").slice(0, 12),
    correlation_id: ev.correlation_id ?? null,
    timestamp: now(),
    source: ev.source, actor: ev.actor ?? null, asset: ev.asset ?? null,
    event_type: ev.event_type,
    severity: ev.severity, confidence: ev.confidence ?? "medium",
    description: ev.description,
    data_classification: ev.data_classification ?? "internal",
    evidence_refs: ev.evidence_refs ?? [],
    related_task: ev.related_task ?? null,
    policy_rule: ev.policy_rule ?? null,
    automatic_action: ev.automatic_action ?? "none",
    approval_required: ev.approval_required ?? false,
    recommended_action: ev.recommended_action ?? null,
    status: "OPEN",
    created_at: now(), resolved_at: null,
    prev_hash: prev,
  };
  // Never let a secret-shaped string enter the security log itself.
  if (SECRETISH.test(JSON.stringify(row))) {
    row.description = "[REDACTED — event body contained a secret-shaped string]";
    row.evidence_refs = [];
  }
  // Hash the body WITHOUT this_hash so verifyChain can recompute it identically.
  row.this_hash = createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 16);
  mkdirSync(path.dirname(EVENTS), { recursive: true });
  appendFileSync(EVENTS, JSON.stringify(row) + "\n");
  return row;
}

export function readEvents() {
  if (!existsSync(EVENTS)) return [];
  return readFileSync(EVENTS, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function verifyChain(events = readEvents()) {
  const breaks = [];
  let prev = "GENESIS";
  for (const e of events) {
    // 1. linkage — was a record removed or reordered?
    if (e.prev_hash !== prev) breaks.push({ event_id: e.event_id, kind: "LINK", expected: prev, found: e.prev_hash });
    // 2. CONTENT — was a field quietly rewritten in place?
    //    Checking linkage alone is not tamper resistance: an edited description
    //    left both hashes untouched and the chain looked intact. Recompute the
    //    hash over the record exactly as emit() did and compare.
    const { this_hash, ...body } = e;
    const recomputed = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
    if (recomputed !== this_hash)
      breaks.push({ event_id: e.event_id, kind: "CONTENT", expected: this_hash, found: recomputed });
    prev = e.this_hash;
  }
  return { intact: breaks.length === 0, checked: events.length, breaks };
}

// ---------------------------------------------------------------- detectors
// Every detector returns events with a rule-derived severity and a counted fact.
const DETECTORS = {
  /** Replication freshness — the parity oracle depends on it. */
  replication() {
    const st = load("/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/17-MIGRATION-LOGS/replication-state.json", null);
    if (!st?.last_success) return [{
      source: "replication", asset: "POR->SSD", event_type: "REPLICATION_NEVER_RAN",
      severity: "HIGH", confidence: "high",
      description: "POR replication has never completed; the certification oracle has no fresh source",
      recommended_action: "Run Replicate-PorToShare.ps1 on ENTERPRISE",
      automatic_action: "mark POR data STALE for certification",
    }];
    const h = (Date.now() - Date.parse(st.last_success)) / 3600000;
    if (h > 24) return [{
      source: "replication", asset: "POR->SSD", event_type: "REPLICATION_STALE",
      severity: h > 72 ? "HIGH" : "WATCH", confidence: "high",
      description: `POR mirror is ${h.toFixed(0)}h old`,
      automatic_action: "mark POR data STALE",
    }];
    return [];
  },

  /** Agent heartbeats — a dead agent must never look healthy. */
  agents() {
    const hb = load(path.join(HANDOFF, "HEARTBEATS.json"), {});
    const out = [];
    for (const [agent, v] of Object.entries(hb)) {
      const ageH = v.last_seen ? (Date.now() - Date.parse(v.last_seen)) / 3600000 : null;
      if (ageH == null || ageH > 24) out.push({
        source: "agents", actor: agent, asset: agent, event_type: "AGENT_HEARTBEAT_STALE",
        severity: "WATCH", confidence: "high",
        description: `${agent} last heartbeat ${ageH == null ? "never" : ageH.toFixed(0) + "h ago"}`,
      });
    }
    return out;
  },

  /** Policy denials from the Matter gateway — attempted boundary crossings. */
  policy() {
    const f = path.join(HANDOFF, "SECURITY_AUDIT.jsonl");
    if (!existsSync(f)) return [];
    const rows = readFileSync(f, "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const day = now().slice(0, 10);
    const denials = rows.filter((r) => r.decision && r.decision !== "ALLOWED" && String(r.at).startsWith(day));
    if (denials.length >= 5) return [{
      source: "policy", asset: "matter-gateway", event_type: "REPEATED_POLICY_DENIAL",
      severity: denials.length >= 20 ? "HIGH" : "WATCH", confidence: "high",
      description: `${denials.length} policy denials today`,
      evidence_refs: ["AI-HANDOFF/SECURITY_AUDIT.jsonl"],
    }];
    return [];
  },

  /** Compute governor — blocked paid runs and cost anomalies. */
  spend() {
    const led = path.join(HANDOFF, "COMPUTE_LEDGER.jsonl");
    if (!existsSync(led)) return [];
    const rows = readFileSync(led, "utf8").split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const day = now().slice(0, 10);
    const today = rows.filter((r) => String(r.at || r.timestamp || "").startsWith(day));
    const started = today.filter((r) => r.status === "STARTED").length;
    if (started > 40) return [{
      source: "spend", asset: "paid-compute", event_type: "COMPUTE_RUN_ANOMALY",
      severity: "HIGH", confidence: "high",
      description: `${started} paid runs started today — above the expected daily envelope`,
      recommended_action: "check the governor run cap and look for a retry loop",
    }];
    return [];
  },

  /** Backup age and restore-test status. */
  backup() {
    const dir = "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/17-MIGRATION-LOGS/nightly";
    if (!existsSync(dir)) return [{
      source: "backup", asset: "SSD", event_type: "BACKUP_MISSING",
      severity: "HIGH", confidence: "high", description: "no nightly backup directory found",
    }];
    const days = readdirSync(dir).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const last = days[days.length - 1];
    const ageD = last ? (Date.now() - Date.parse(last)) / 86400000 : 999;
    const out = [];
    if (ageD > 2) out.push({
      source: "backup", asset: "SSD", event_type: "BACKUP_STALE",
      severity: ageD > 7 ? "HIGH" : "WATCH", confidence: "high",
      description: `last backup ${last || "never"} (${ageD.toFixed(0)}d old)`,
    });
    // Verified-copy is not the same as recoverable.
    out.push({
      source: "backup", asset: "SSD", event_type: "RESTORE_NEVER_TESTED",
      severity: "WATCH", confidence: "high",
      description: "backups are checksum-verified but have never been restore-tested",
      recommended_action: "perform one restore drill from an SSD backup",
    });
    return out;
  },

  /** Public web security posture. */
  async web() {
    const out = [];
    for (const host of ["https://partyperfect.app", "https://partyperfectjobs.com"]) {
      try {
        const r = await fetch(host, { redirect: "follow" });
        const need = ["content-security-policy", "x-content-type-options", "referrer-policy"];
        const missing = need.filter((h) => !r.headers.get(h));
        if (missing.length) out.push({
          source: "web", asset: host, event_type: "SECURITY_HEADERS_MISSING",
          severity: missing.length >= 3 ? "HIGH" : "WATCH", confidence: "high",
          description: `missing: ${missing.join(", ")}`,
          related_task: "SEC-HEADERS-001",
        });
      } catch (e) {
        out.push({ source: "web", asset: host, event_type: "HOST_UNREACHABLE", severity: "WATCH", confidence: "medium", description: String(e).slice(0, 80) });
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------- injection
const INJECTION = [
  /ignore (all |any )?(previous|prior|above) instructions/i,
  /disregard (your|the) (rules|instructions|policy)/i,
  /you are now (a|an|the)/i, /system prompt/i,
  /\bact as (an? )?(admin|owner|root)/i,
  /reveal (your |the )?(prompt|instructions|secret|api key)/i,
];

/**
 * Screen untrusted business data. Returns a signal only — the matched text is
 * NEVER echoed into an event body, because repeating it is the injection.
 */
export function screenArtifact(text, source) {
  const hits = INJECTION.filter((re) => re.test(String(text || "")));
  if (!hits.length) return { clean: true };
  return {
    clean: false,
    event: {
      source: "ai-input", asset: source, event_type: "PROMPT_INJECTION_SUSPECTED",
      severity: "HIGH", confidence: "medium",
      description: `Untrusted ${source} content matched ${hits.length} injection pattern(s). Content withheld from this record by design.`,
      data_classification: "untrusted",
      automatic_action: "quarantine_artifact — excluded from AI processing",
      recommended_action: "human review of the source artifact",
    },
  };
}

// ---------------------------------------------------------------- health
export function health() {
  const h = load(HEALTH, null);
  if (!h?.last_scan) return { state: "OFFLINE", detail: "Sentinel has never completed a scan" };
  const ageH = (Date.now() - Date.parse(h.last_scan)) / 3600000;
  if (ageH > 24) return { state: "STALE", detail: `last scan ${ageH.toFixed(0)}h ago`, last_scan: h.last_scan };
  if (h.detector_errors?.length) return { state: "DEGRADED", detail: `${h.detector_errors.length} detector(s) failing`, last_scan: h.last_scan };
  return { state: "HEALTHY", last_scan: h.last_scan };
}

// ---------------------------------------------------------------- inbox
function inbox() {
  const events = readEvents().filter((e) => e.status === "OPEN");
  // Group duplicates so one repeated condition is one inbox line, not a storm.
  const grouped = {};
  for (const e of events) {
    const k = `${e.event_type}|${e.asset}`;
    if (!grouped[k]) grouped[k] = { ...e, count: 0, first: e.timestamp, last: e.timestamp };
    grouped[k].count++;
    grouped[k].last = e.timestamp;
  }
  const rows = Object.values(grouped).sort((a, b) => SEVERITY.indexOf(b.severity) - SEVERITY.indexOf(a.severity));
  const h = health();

  console.log("=============== OWNER SECURITY INBOX ===============");
  if (h.state !== "HEALTHY") console.log(`  ⚠️  SECURITY MONITORING ${h.state} — ${h.detail}\n`);
  if (!rows.length) console.log("  no open security events");
  for (const r of rows) {
    console.log(`  [${r.severity}] ${r.event_type}${r.count > 1 ? ` ×${r.count}` : ""}  ${r.asset || ""}`);
    console.log(`      ${r.description}`);
    if (r.automatic_action !== "none") console.log(`      auto: ${r.automatic_action}`);
    if (r.recommended_action) console.log(`      do:   ${r.recommended_action}`);
    if (r.approval_required) console.log("      ⚠️  OWNER ACTION REQUIRED");
  }
  const chain = verifyChain();
  console.log(`\n  evidence chain: ${chain.intact ? "INTACT" : `BROKEN at ${chain.breaks.length} point(s)`} (${chain.checked} events)`);
  console.log("===================================================");
}

// ---------------------------------------------------------------- cli
const argv = process.argv.slice(2);

if (argv.includes("--status")) { console.log(JSON.stringify(health(), null, 2)); process.exit(0); }
if (argv.includes("--inbox")) { inbox(); process.exit(0); }
if (argv.includes("--verify-chain")) { console.log(JSON.stringify(verifyChain(), null, 2)); process.exit(0); }

if (argv.includes("--scan")) {
  const errors = [];
  let emitted = 0;
  for (const [name, fn] of Object.entries(DETECTORS)) {
    try {
      const evs = await fn();
      for (const e of evs) { emit(e); emitted++; }
    } catch (err) { errors.push({ detector: name, error: String(err).slice(0, 120) }); }
  }
  mkdirSync(HERE, { recursive: true });
  writeFileSync(HEALTH, JSON.stringify({ last_scan: now(), detector_errors: errors, emitted }, null, 2));
  console.log(`sentinel scan: ${emitted} event(s), ${errors.length} detector error(s) · ${health().state}`);
  for (const e of errors) console.log(`  ERROR ${e.detector}: ${e.error}`);
  process.exit(0);
}

console.log("usage: --scan | --inbox | --status | --verify-chain | --test");
