#!/usr/bin/env node
// BRAIN STATUS — what every AI should read BEFORE trusting Party Perfect data.
//
// Answers one question per source: is this LIVE, STALE, or FROZEN, and as of when.
// Deterministic. Read-only. Calls no model. Prints human text, or JSON with --json.
//
//   node AI-HANDOFF/brain-status.mjs
//   node AI-HANDOFF/brain-status.mjs --json
//
// WHY THIS EXISTS: on 2026-09-30 the ops snapshot was 2 minutes old while the
// transaction detail behind it was 50 days old. Both lived in "the brain". Nothing
// said which was which, so an agent could answer "last week's revenue" from a
// frozen mirror and sound completely confident. This file is the freshness contract.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const JSON_OUT = process.argv.includes("--json");
const now = Date.now();
const mins = (iso) => (iso ? Math.round((now - Date.parse(iso)) / 60000) : null);
const age = (m) => (m == null ? "unknown" : m < 60 ? `${m}m` : m < 2880 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`);

/** Freshness thresholds in minutes. Past FROZEN, data must not be presented as current. */
const LIMITS = { LIVE: 60, STALE: 1440 };
const grade = (m) => (m == null ? "UNKNOWN" : m <= LIMITS.LIVE ? "LIVE" : m <= LIMITS.STALE ? "STALE" : "FROZEN");

const env = (() => {
  const f = path.join(REPO, ".env.local");
  if (!existsSync(f)) return {};
  return Object.fromEntries(readFileSync(f, "utf8").split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
})();

async function opsSnapshot() {
  const src = { name: "POR ops snapshot", what: "AR, aging, payments 24h, inventory totals, deliveries/returns today",
                path: "ENTERPRISE → /api/por/sync", syncedAt: null, note: "" };
  try {
    const { fetchLiveSnapshotViaSession } = await import(path.join(HERE, "mike-brain/live-answer.mjs"));
    const r = await fetchLiveSnapshotViaSession({});
    if (!r.live?.ok && !r.snapshot) { src.note = r.live?.code || "unreachable"; return src; }
    src.syncedAt = r.snapshot?.syncedAt || null;
    src.agentBuild = r.snapshot?.agentBuild || null;
    const money = Object.keys(r.snapshot?.money || {});
    src.note = src.agentBuild ? `agentBuild ${src.agentBuild}` : "NO agentBuild — ENTERPRISE is running a pre-2026-08-07 script";
    src.missing = ["revenue", "week"].filter((k) => !money.includes(k));
  } catch (e) { src.note = String(e.message).slice(0, 70); }
  return src;
}

async function crmMirror() {
  const src = { name: "POR transaction detail", what: "36k transactions, customers, payments — every dated dollar figure",
                path: "ENTERPRISE → /api/por/sync/crm → Redis", syncedAt: null, note: "" };
  const url = env.KV_REST_API_URL, tok = env.KV_REST_API_READ_ONLY_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !tok) { src.note = "KV not configured on this machine"; return src; }
  try {
    const r = await fetch(`${url}/get/pp:por:crm-meta`, { headers: { Authorization: `Bearer ${tok}` } });
    const j = await r.json();
    const meta = j?.result ? JSON.parse(j.result) : null;
    if (!meta) { src.note = "no crm-meta key — mirror has never been populated"; return src; }
    src.syncedAt = meta.syncedAt || null;
    src.note = /bootstrap/i.test(meta.source || "") ? `hand-loaded: ${String(meta.source).slice(0, 52)}` : String(meta.source || "");
    src.counts = meta.counts || null;
  } catch (e) { src.note = String(e.message).slice(0, 70); }
  return src;
}

function directSql() {
  const src = { name: "Direct POR SQL", what: "ad-hoc queries: any date range, any table",
                path: "192.168.0.5:9676 (NTLM)", syncedAt: null, note: "" };
  try {
    execFileSync("nc", ["-z", "-G2", "192.168.0.5", "9676"], { stdio: "ignore" });
    src.reachable = true;
  } catch { src.reachable = false; src.note = "port 9676 unreachable"; return src; }
  try {
    const out = execFileSync("security", ["find-generic-password", "-s", "enterprise-winrm"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const m = out.match(/"mdat"<timedate>=0x[0-9A-F]*\s+"(\d{4})(\d{2})(\d{2})/);
    if (m) {
      const set = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
      const days = Math.round((now - set.getTime()) / 86400000);
      src.credentialSet = `${m[1]}-${m[2]}-${m[3]}`;
      src.note = days >= 30 ? `credential set ${days}d ago — domain passwords typically expire at 30d` : `credential set ${days}d ago`;
    } else src.note = "no keychain entry";
  } catch { src.note = "no keychain entry for enterprise-winrm"; }
  return src;
}

function localExport() {
  const p = "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN/15-RAW-EXPORTS/2026-08-10_POR-FULL-DATA";
  return { name: "SSD full export", what: "524-table POR dump — the fallback when everything above is down",
           path: p, syncedAt: existsSync(p) ? "2026-08-10T00:00:00Z" : null,
           note: existsSync(p) ? "mounted" : "PARTYPERF not mounted" };
}

const sources = [await opsSnapshot(), await crmMirror(), directSql(), localExport()];
for (const s of sources) { s.ageMinutes = mins(s.syncedAt); s.status = s.reachable === false ? "OFFLINE" : grade(s.ageMinutes); }

if (JSON_OUT) { console.log(JSON.stringify({ generated_at: new Date().toISOString(), limits: LIMITS, sources }, null, 2)); process.exit(0); }

const W = 26;
console.log(`\nPARTY PERFECT BRAIN — DATA FRESHNESS   ${new Date().toISOString().slice(0, 16).replace("T", " ")}\n`);
for (const s of sources) {
  const badge = { LIVE: "● LIVE  ", STALE: "◐ STALE ", FROZEN: "○ FROZEN", OFFLINE: "✕ OFFLINE", UNKNOWN: "? UNKNOWN" }[s.status];
  console.log(`${badge}  ${s.name.padEnd(W)} ${s.syncedAt ? age(s.ageMinutes).padStart(5) + " old" : "     —    "}`);
  console.log(`            ${s.what}`);
  if (s.note) console.log(`            ${s.note}`);
  if (s.missing?.length) console.log(`            MISSING FIELDS: ${s.missing.join(", ")} — deploy por-sync-agent/Sync-PorSnapshot.ps1`);
  console.log();
}
const frozen = sources.filter((s) => ["FROZEN", "OFFLINE"].includes(s.status));
if (frozen.length) {
  console.log("RULE FOR EVERY AGENT:");
  console.log("  Do NOT present figures derived from a FROZEN or OFFLINE source as current.");
  console.log("  Say the cutoff date, or say you cannot answer. A confident wrong number is the failure mode.\n");
  console.log(`  Currently not current: ${frozen.map((s) => s.name).join(" · ")}`);
  console.log("  Fix: see AI-HANDOFF/BRAIN_LIVE_DATA_RUNBOOK.md\n");
} else console.log("All sources current.\n");
