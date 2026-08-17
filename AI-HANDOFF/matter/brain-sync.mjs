#!/usr/bin/env node
// BRAIN SYNC — deterministic. Calls no model. (§7)
//
// SAVE -> TEST -> EVIDENCE -> AI-HANDOFF -> MANIFEST -> SHARED BRAIN -> VERIFICATION READY
//
// STATUS: SYNC CODE READY. AUTOMATIC SYNC IS **NOT** RUNNING.
// This Mac's launchd cannot schedule anything (RunAtLoad/StartInterval/KeepAlive all dead —
// see MACOS_BACKGROUND_DIAGNOSTIC.md), so installing a timer here would be a false claim of
// autonomy. Run it manually, or wire it after launchd recovery is certified.
//
//   node brain-sync.mjs --dry-run     show what WOULD sync (default; changes nothing)
//   node brain-sync.mjs --run         perform the sync to the configured destination
//   node brain-sync.mjs --status      last attempt / last success / manifest version
//
// DESTINATION: set BRAIN_SYNC_DEST to a real synced folder. There is no Google Drive on this
// Mac today (verified), so with no destination configured this exits cleanly as NOT_CONFIGURED
// rather than pretending to have synced.
//
// NEVER SYNCED: credentials, API keys, plaintext PINs, secret env files, customer PII.
// The allowlist below is deliberately narrow — durable knowledge/evidence only. Git remains
// authoritative for source; the database remains authoritative for structured runtime state.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);
const STATE = path.join(HERE, "BRAIN_SYNC_STATE.json");
const LOG = path.join(HERE, "BRAIN_SYNC_LOG.jsonl");
const DEST = process.env.BRAIN_SYNC_DEST || null;

const now = () => new Date().toISOString();
const readJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };
const append = (o) => { appendFileSync(LOG, JSON.stringify({ at: now(), ...o }) + "\n"); };
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);

/** What belongs in a SHARED KNOWLEDGE layer. Durable understanding, never source or secrets. */
const INCLUDE = [
  "PARTY_PERFECT_BRAIN_MANIFEST.json",
  "MATTER_24_7_AUTONOMY_AUDIT.md",
  "MATTER_P0_STATUS.md",
  "MIKE_LIVE_ROUTING_P0_STATUS.md",
  "DECISIONS.md",
  "PARTY_PERFECT_SYSTEM_TRUTH.md",
  "matter/MATTER_V1_AUDIT.md",
  "matter/MACOS_BACKGROUND_DIAGNOSTIC.md",
  "matter/LOGOUT_TEST_RUNBOOK.md",
  "matter/MATTER_POLICY.json",
  "matter/BUSINESS_AGENTS.json",
  "EVIDENCE/MATTER_PROVIDER_NEUTRAL_V1_VERIFICATION_MANIFEST.md",
];
/** Whole directories of evidence summaries (markdown only — no bundles, no binaries). */
const INCLUDE_DIRS = [{ dir: "EVIDENCE", ext: [".md"] }];

/** Refuse to sync anything matching these, whatever the allowlist says. */
const FORBIDDEN_NAME = /(\.env|secret|credential|token|password|\.pem|\.key|id_rsa|\.bundle$)/i;
const FORBIDDEN_CONTENT = /(sk-[A-Za-z0-9]{16}|xai-[A-Za-z0-9]{16}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?:\/\/[^:]+:[^@]+@|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S|OWNER_PIN\s*=\s*\d)/;

function candidates() {
  const out = [];
  for (const rel of INCLUDE) { const p = path.join(HANDOFF, rel); if (existsSync(p)) out.push({ rel, abs: p }); }
  for (const { dir, ext } of INCLUDE_DIRS) {
    const base = path.join(HANDOFF, dir);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const abs = path.join(base, name);
      try { if (!statSync(abs).isFile()) continue; } catch { continue; }
      if (!ext.some((e) => name.endsWith(e))) continue;
      const rel = path.join(dir, name);
      if (!out.find((o) => o.rel === rel)) out.push({ rel, abs });
    }
  }
  return out;
}

/** Every file is screened twice — by name and by content — before it can leave the machine. */
function screen(file) {
  if (FORBIDDEN_NAME.test(path.basename(file.rel))) return { ok: false, reason: "forbidden filename pattern" };
  let txt = "";
  try { txt = readFileSync(file.abs, "utf8"); } catch { return { ok: false, reason: "unreadable" }; }
  if (FORBIDDEN_CONTENT.test(txt)) return { ok: false, reason: "content matched a secret pattern" };
  return { ok: true };
}

function sourceSha() {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim(); } catch { return null; }
}

export function plan() {
  const files = [], rejected = [];
  for (const f of candidates()) {
    const s = screen(f);
    if (s.ok) files.push({ ...f, sha: sha256(f.abs) }); else rejected.push({ rel: f.rel, reason: s.reason });
  }
  const manifest = readJson(path.join(HANDOFF, "PARTY_PERFECT_BRAIN_MANIFEST.json"), {});
  return { files, rejected, manifest_version: manifest.manifest_version || null, source_sha: sourceSha(), dest: DEST };
}

export function run({ dryRun = true } = {}) {
  const p = plan();
  const st = readJson(STATE, { last_sync_attempt: null, last_successful_sync: null, files_changed: 0, manifest_version: null, errors: [], source_sha: null });
  st.last_sync_attempt = now();
  st.manifest_version = p.manifest_version;
  st.source_sha = p.source_sha;

  if (!p.dest) {
    st.errors = [{ at: now(), error: "NOT_CONFIGURED: BRAIN_SYNC_DEST is unset and no Google Drive destination exists on this Mac" }];
    if (!dryRun) writeJsonState(st);
    append({ event: "SYNC_SKIPPED", reason: "NOT_CONFIGURED", planned_files: p.files.length, rejected: p.rejected.length });
    return { status: "NOT_CONFIGURED", ...p, state: st };
  }

  if (dryRun) { append({ event: "DRY_RUN", planned_files: p.files.length, rejected: p.rejected.length }); return { status: "DRY_RUN", ...p, state: st }; }

  let changed = 0;
  const errors = [];
  for (const f of p.files) {
    try {
      const target = path.join(p.dest, f.rel);
      mkdirSync(path.dirname(target), { recursive: true });
      // Idempotent: only copy when content actually differs.
      let same = false;
      if (existsSync(target)) { try { same = sha256(target) === f.sha; } catch { same = false; } }
      if (!same) { copyFileSync(f.abs, target); changed += 1; }
    } catch (e) { errors.push({ file: f.rel, error: String(e.message).slice(0, 160) }); }
  }
  st.files_changed = changed;
  st.errors = errors;
  if (!errors.length) st.last_successful_sync = now();
  writeJsonState(st);
  append({ event: "SYNC", files_changed: changed, errors: errors.length, manifest_version: p.manifest_version, source_sha: p.source_sha });
  return { status: errors.length ? "PARTIAL" : "OK", changed, errors, ...p, state: st };
}

function writeJsonState(st) { writeFileSync(STATE, JSON.stringify(st, null, 2) + "\n"); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--status")) { console.log(JSON.stringify(readJson(STATE, { note: "no sync has ever run" }), null, 2)); process.exit(0); }
  const r = run({ dryRun: !argv.includes("--run") });
  console.log(`status              : ${r.status}`);
  console.log(`destination         : ${r.dest || "NONE CONFIGURED (no Google Drive on this Mac)"}`);
  console.log(`manifest version    : ${r.manifest_version}`);
  console.log(`source sha          : ${r.source_sha}`);
  console.log(`files that would sync: ${r.files.length}`);
  for (const f of r.files) console.log(`   ${f.rel}`);
  if (r.rejected.length) { console.log(`REJECTED (never leave the machine): ${r.rejected.length}`); for (const x of r.rejected) console.log(`   ${x.rel} — ${x.reason}`); }
  if (r.status === "NOT_CONFIGURED") console.log("\nAUTOMATIC SYNC: NOT RUNNING. Set BRAIN_SYNC_DEST to a real synced folder, then run with --run.");
}
