#!/usr/bin/env node
// BRAIN STATUS — what every agent should check BEFORE trusting Party Perfect data.
//
// Answers one question per source: is this LIVE, STALE, FROZEN, or unreachable, and
// as of when. Deterministic. Read-only. Calls no model.
//
//   node AI-HANDOFF/brain-status.mjs           human-readable
//   node AI-HANDOFF/brain-status.mjs --json    machine-readable, for other agents
//
// WHY THIS EXISTS: a POR ops snapshot can be minutes old while the transaction detail
// behind it is weeks old. Both live in "the brain". Nothing marked which was which, so
// an agent could answer a dated-revenue question from a frozen mirror and sound
// completely confident. This file is the freshness contract.
//
// TESTABILITY: every grading rule below is pure and exported, and the probes are only
// invoked from the CLI block at the bottom. Importing this module performs NO network
// call, NO keychain read, and NO filesystem probe — see test-brain-status.mjs.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);

// ---------------------------------------------------------------- grading (pure)

/** Freshness thresholds in minutes. Past FROZEN, data must not be presented as current. */
export const LIMITS = { LIVE: 60, STALE: 1440 };

export const STATUSES = ["LIVE", "STALE", "FROZEN", "OFFLINE", "UNKNOWN"];

/** Boundaries in milliseconds. Grading uses EXACT elapsed time, never rounded minutes:
 *  rounding made 60m30s read as LIVE. */
export const LIVE_MS = LIMITS.LIVE * 60_000;
export const STALE_MS = LIMITS.STALE * 60_000;

/** Exact elapsed milliseconds. Negative means the timestamp is in the future. */
export function ageMs(syncedAt, nowMs = Date.now()) {
  if (!syncedAt) return null;
  const t = Date.parse(syncedAt);
  if (!Number.isFinite(t)) return null;
  return nowMs - t;
}

/** Whole minutes, for DISPLAY only. Never use this for grading. */
export function ageMinutes(syncedAt, nowMs = Date.now()) {
  const ms = ageMs(syncedAt, nowMs);
  return ms == null ? null : Math.round(ms / 60_000);
}

/** True when a source claims a timestamp ahead of our clock — skew or a bad writer. */
export function isFuture(syncedAt, nowMs = Date.now()) {
  const ms = ageMs(syncedAt, nowMs);
  return ms != null && ms < 0;
}

/**
 * Grade EXACT elapsed milliseconds. Unknown age is UNKNOWN, never optimistically LIVE.
 * A future timestamp is UNKNOWN: we cannot trust a source whose clock disagrees with ours.
 * Boundaries are inclusive: exactly 60m is LIVE, one millisecond past is STALE.
 */
export function grade(ms) {
  if (ms == null) return "UNKNOWN";
  if (ms < 0) return "UNKNOWN";
  if (ms <= LIVE_MS) return "LIVE";
  if (ms <= STALE_MS) return "STALE";
  return "FROZEN";
}

/**
 * Classify one source record into a status.
 * A source explicitly marked unreachable is OFFLINE regardless of any timestamp it
 * carries — a stale timestamp from a dead source must never read as merely STALE.
 */
export function classify(source, nowMs = Date.now()) {
  // "not configured" means we never looked -> UNKNOWN. "unreachable" means we looked and
  // it is dead -> OFFLINE. Conflating them would claim knowledge we do not have.
  if (source?.configured === false) return "UNKNOWN";
  if (source?.reachable === false) return "OFFLINE";
  return grade(ageMs(source?.syncedAt, nowMs));
}

/** Only a LIVE source may be quoted without a cutoff date. */
export function isCurrent(source, nowMs = Date.now()) {
  return classify(source, nowMs) === "LIVE";
}

/**
 * THE GUARD. Call before presenting a figure derived from a source.
 * Returns {ok:true} for LIVE. For anything else it returns ok:false plus the caveat the
 * answer MUST carry. Callers must not drop the caveat — a confident wrong number is the
 * failure mode this whole file exists to prevent.
 */
export function presentationGuard(source, nowMs = Date.now()) {
  const status = classify(source, nowMs);
  if (status === "LIVE") return { ok: true, status, caveat: null };
  const name = source?.name || "source";
  const as = source?.syncedAt ? ` as of ${String(source.syncedAt).slice(0, 10)}` : "";
  if (isFuture(source?.syncedAt, nowMs)) {
    return { ok: false, status, skew: true,
      caveat: `${name} reports a timestamp in the FUTURE (${String(source.syncedAt).slice(0, 19)}Z) — clock skew between this machine and the source. Freshness is UNKNOWN; do not present its figures as current until the clocks agree.` };
  }
  if (source?.configured === false) {
    return { ok: false, status,
      caveat: `${name} is NOT CONFIGURED on this machine — freshness is UNKNOWN because it was never probed. No figure may be taken from it.` };
  }
  const why = {
    STALE: `${name} is STALE${as} — state the cutoff date with any figure taken from it.`,
    FROZEN: `${name} is FROZEN${as} — do NOT present its figures as current. State the cutoff date, or decline.`,
    OFFLINE: `${name} is OFFLINE — no figure may be taken from it.`,
    UNKNOWN: `${name} freshness is UNKNOWN — treat as not current until proven otherwise.`,
  }[status];
  return { ok: false, status, caveat: why };
}

export const humanAge = (m) =>
  m == null ? "unknown" : m < 60 ? `${m}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;

/**
 * Requirement: missing configuration must fail TRUTHFULLY — never silently LIVE.
 * Pure: takes an env-like object, returns a source-shaped verdict. No filesystem read.
 */
export function configStatus(env = {}, { name = "source", needs = [] } = {}) {
  const missing = needs.filter((k) => !env[k]);
  if (missing.length) {
    // Deliberately does NOT set reachable:false — we did not probe, so we must not imply we did.
    return { name, syncedAt: null,
             note: `not configured on this machine: ${missing.join(", ")} absent`, configured: false };
  }
  return { name, configured: true };
}

/** Fields that may never appear in emitted output. Enforced by redactSource(). */
const FORBIDDEN_KEYS = /token|password|secret|key|credential|cookie|authorization|pin|ssn|phone|email/i;

/**
 * Build the machine-readable report. Emits ONLY an allow-listed set of fields, so a
 * probe that accidentally attaches a token cannot leak it into --json output.
 */
export function redactSource(src, nowMs = Date.now()) {
  const allow = ["name", "what", "path", "syncedAt", "note", "agentBuild", "missing", "reachable", "configured"];
  const out = {};
  for (const k of allow) if (src?.[k] !== undefined) out[k] = src[k];
  for (const k of Object.keys(out)) if (FORBIDDEN_KEYS.test(k)) delete out[k];
  out.ageMs = ageMs(out.syncedAt, nowMs);
  out.ageMinutes = ageMinutes(out.syncedAt, nowMs);
  if (isFuture(out.syncedAt, nowMs)) out.clock_skew = true;
  out.status = classify(src, nowMs);
  out.cutoff = out.syncedAt ? String(out.syncedAt).slice(0, 19) + "Z" : null;
  const g = presentationGuard(src, nowMs);
  out.may_be_quoted_as_current = g.ok;
  out.required_caveat = g.caveat;
  return out;
}

export function buildReport(sources, nowMs = Date.now()) {
  return {
    generated_at: new Date(nowMs).toISOString(),
    limits: LIMITS,
    contract: "Do not present FROZEN, OFFLINE or UNKNOWN figures as current. State the cutoff date, or decline.",
    sources: sources.map((s) => redactSource(s, nowMs)),
  };
}

/** Human render. Every non-LIVE line carries its cutoff timestamp and caveat. */
export function renderText(report) {
  const W = 26, L = [];
  L.push(`PARTY PERFECT BRAIN — DATA FRESHNESS   ${report.generated_at.slice(0, 16).replace("T", " ")}`, "");
  for (const s of report.sources) {
    const badge = { LIVE: "● LIVE  ", STALE: "◐ STALE ", FROZEN: "○ FROZEN", OFFLINE: "✕ OFFLINE", UNKNOWN: "? UNKNOWN" }[s.status];
    L.push(`${badge}  ${(s.name || "").padEnd(W)} ${s.cutoff ? "cutoff " + s.cutoff : "cutoff —"}  (${humanAge(s.ageMinutes)} old)`);
    if (s.what) L.push(`            ${s.what}`);
    if (s.note) L.push(`            ${s.note}`);
    if (s.missing?.length) L.push(`            MISSING FIELDS: ${s.missing.join(", ")}`);
    if (!s.may_be_quoted_as_current) L.push(`            ${s.required_caveat}`);
    L.push("");
  }
  return L.join("\n");
}

// ---------------------------------------------------------------- probes (side effects)
// None of these run on import. The CLI block at the bottom is their only caller.

function envLocal() {
  const f = path.join(REPO, ".env.local");
  if (!existsSync(f)) return {};
  return Object.fromEntries(readFileSync(f, "utf8").split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
}

async function probeOpsSnapshot() {
  const src = { name: "POR ops snapshot", what: "AR, aging, payments 24h, inventory totals, deliveries/returns today",
                path: "ENTERPRISE → /api/por/sync", syncedAt: null, note: "" };
  try {
    const { fetchLiveSnapshotViaSession } = await import(path.join(HERE, "mike-brain/live-answer.mjs"));
    const r = await fetchLiveSnapshotViaSession({});
    if (!r.live?.ok && !r.snapshot) { src.reachable = false; src.note = r.live?.code || "unreachable"; return src; }
    src.syncedAt = r.snapshot?.syncedAt || null;
    src.agentBuild = r.snapshot?.agentBuild || null;
    const money = Object.keys(r.snapshot?.money || {});
    src.note = src.agentBuild ? `agentBuild ${src.agentBuild}` : "no agentBuild — ENTERPRISE is running an outdated sync agent";
    src.missing = ["revenue", "week"].filter((k) => !money.includes(k));
  } catch (e) { src.reachable = false; src.note = String(e.message).slice(0, 70); }
  return src;
}

async function probeCrmMirror() {
  const src = { name: "POR transaction detail", what: "transactions, customers, payments — every dated dollar figure",
                path: "ENTERPRISE → /api/por/sync/crm → Redis", syncedAt: null, note: "" };
  const env = envLocal();
  // READ-ONLY token only. Never fall back to the read-write token: a status tool must not
  // hold write authority, and a silent fallback would grant it invisibly.
  const cfg = configStatus(env, { name: src.name, needs: ["KV_REST_API_URL", "KV_REST_API_READ_ONLY_TOKEN"] });
  if (!cfg.configured) return { ...src, configured: false, note: cfg.note };
  const url = env.KV_REST_API_URL, tok = env.KV_REST_API_READ_ONLY_TOKEN;
  try {
    const r = await fetch(`${url}/get/pp:por:crm-meta`, { headers: { Authorization: `Bearer ${tok}` } });
    const j = await r.json();
    const meta = j?.result ? JSON.parse(j.result) : null;
    if (!meta) { src.reachable = false; src.note = "no crm-meta key — mirror has never been populated"; return src; }
    src.syncedAt = meta.syncedAt || null;
    src.note = /bootstrap/i.test(meta.source || "") ? "hand-loaded bootstrap, not an automatic refresh" : String(meta.source || "");
  } catch (e) { src.reachable = false; src.note = String(e.message).slice(0, 70); }
  return src;
}

/**
 * Direct SQL reachability. Deliberately does NOT read, test, or report on any credential
 * value — only whether the port answers. Credential handling is out of scope for a
 * status tool; see BRAIN_LIVE_DATA_RUNBOOK.md.
 */
function probeDirectSql() {
  const src = { name: "Direct POR SQL", what: "ad-hoc queries: any date range, any table",
                path: "POR host:port (NTLM)", syncedAt: null, note: "" };
  // No hardcoded host or port. Without explicit configuration we do not probe at all and
  // report UNKNOWN -- guessing an address would both leak topology and fake a result.
  const cfg = configStatus(process.env, { name: src.name, needs: ["POR_SQL_HOST", "POR_SQL_PORT"] });
  if (!cfg.configured) return { ...src, configured: false, note: cfg.note };
  try { execFileSync("nc", ["-z", "-G2", process.env.POR_SQL_HOST, process.env.POR_SQL_PORT], { stdio: "ignore" }); src.reachable = true; src.note = "port answers; run a real query to confirm the login"; }
  catch { src.reachable = false; src.note = "port unreachable"; }
  return src;
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const jsonOut = process.argv.includes("--json");
  const sources = [await probeOpsSnapshot(), await probeCrmMirror(), probeDirectSql()];
  for (const s of sources) { s.ageMinutes = ageMinutes(s.syncedAt); s.status = classify(s); }

  const report = buildReport(sources);
  if (jsonOut) { console.log(JSON.stringify(report, null, 2)); }
  else {
    console.log("\n" + renderText(report));
    const bad = report.sources.filter((s) => !s.may_be_quoted_as_current);
    if (bad.length) {
      console.log("RULE FOR EVERY AGENT:");
      console.log("  " + report.contract + "\n");
      for (const s of bad) console.log(`  · ${s.required_caveat}`);
      console.log("\n  Fix: AI-HANDOFF/BRAIN_LIVE_DATA_RUNBOOK.md\n");
    } else console.log("All sources current.\n");
  }
}
