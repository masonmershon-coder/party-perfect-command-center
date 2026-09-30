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

/** Age in whole minutes between a timestamp and `nowMs`. null when unparseable/absent. */
export function ageMinutes(syncedAt, nowMs = Date.now()) {
  if (!syncedAt) return null;
  const t = Date.parse(syncedAt);
  if (!Number.isFinite(t)) return null;
  return Math.round((nowMs - t) / 60000);
}

/** Grade a raw age. Unknown age is UNKNOWN, never optimistically LIVE. */
export function grade(mins) {
  if (mins == null) return "UNKNOWN";
  if (mins <= LIMITS.LIVE) return "LIVE";
  if (mins <= LIMITS.STALE) return "STALE";
  return "FROZEN";
}

/**
 * Classify one source record into a status.
 * A source explicitly marked unreachable is OFFLINE regardless of any timestamp it
 * carries — a stale timestamp from a dead source must never read as merely STALE.
 */
export function classify(source, nowMs = Date.now()) {
  if (source?.reachable === false) return "OFFLINE";
  return grade(ageMinutes(source?.syncedAt, nowMs));
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
  const url = env.KV_REST_API_URL, tok = env.KV_REST_API_READ_ONLY_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !tok) { src.reachable = false; src.note = "KV not configured on this machine"; return src; }
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
  const host = process.env.POR_SQL_HOST || "192.168.0.5", port = process.env.POR_SQL_PORT || "9676";
  try { execFileSync("nc", ["-z", "-G2", host, port], { stdio: "ignore" }); src.reachable = true; src.note = "port answers; run a real query to confirm the login"; }
  catch { src.reachable = false; src.note = "port unreachable"; }
  return src;
}

// ---------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const jsonOut = process.argv.includes("--json");
  const sources = [await probeOpsSnapshot(), await probeCrmMirror(), probeDirectSql()];
  for (const s of sources) { s.ageMinutes = ageMinutes(s.syncedAt); s.status = classify(s); }

  if (jsonOut) {
    console.log(JSON.stringify({ generated_at: new Date().toISOString(), limits: LIMITS, sources }, null, 2));
  } else {
    const W = 26;
    console.log(`\nPARTY PERFECT BRAIN — DATA FRESHNESS   ${new Date().toISOString().slice(0, 16).replace("T", " ")}\n`);
    for (const s of sources) {
      const badge = { LIVE: "● LIVE  ", STALE: "◐ STALE ", FROZEN: "○ FROZEN", OFFLINE: "✕ OFFLINE", UNKNOWN: "? UNKNOWN" }[s.status];
      console.log(`${badge}  ${s.name.padEnd(W)} ${s.syncedAt ? humanAge(s.ageMinutes).padStart(5) + " old" : "     —    "}`);
      console.log(`            ${s.what}`);
      if (s.note) console.log(`            ${s.note}`);
      if (s.missing?.length) console.log(`            MISSING FIELDS: ${s.missing.join(", ")} — deploy por-sync-agent/Sync-PorSnapshot.ps1`);
      console.log();
    }
    const notCurrent = sources.filter((s) => !isCurrent(s));
    if (notCurrent.length) {
      console.log("RULE FOR EVERY AGENT:");
      console.log("  Do NOT present figures from a FROZEN or OFFLINE source as current.");
      console.log("  State the cutoff date, or say you cannot answer.\n");
      for (const s of notCurrent) console.log(`  · ${presentationGuard(s).caveat}`);
      console.log("\n  Fix: AI-HANDOFF/BRAIN_LIVE_DATA_RUNBOOK.md\n");
    } else console.log("All sources current.\n");
  }
}
