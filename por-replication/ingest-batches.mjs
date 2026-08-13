#!/usr/bin/env node
// PARTY PERFECT — POR replication ingester (Mac side). DETERMINISTIC, no LLM.
//
//   node ingest-batches.mjs              ingest every READY batch
//   node ingest-batches.mjs --dry-run    report only
//   node ingest-batches.mjs --status     checkpoints + freshness
//
// ENTERPRISE extracts POR (read-only) into batches on the PPL Storage share.
// This side verifies a batch is COMPLETE and INTACT, then promotes it onto the
// PARTYPERF SSD as the fresh mirror the certification engine reads.
//
// VERIFICATION IS THE POINT. A copy that returns success is not evidence:
//   1. READY marker present         — writer finished
//   2. MANIFEST status COMPLETE     — no table failed on the source
//   3. every file present           — nothing lost in transit
//   4. sha256 matches the manifest  — nothing corrupted in transit
//   5. row count matches            — nothing truncated
//   6. snapshot completeness        — rows_written == source_total_rows
// Any failure => batch QUARANTINED, SSD untouched, failure recorded.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, appendFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);

const SHARE = process.env.POR_SHARE_ROOT || "/Volumes/PPL Storage/POR-REPLICATION";
const SSD = process.env.PP_SSD_ROOT || "/Volumes/PARTYPERF/PARTY-PERFECT-BRAIN";
const MIRROR = path.join(SSD, "15-RAW-EXPORTS", "_LIVE-MIRROR");
const STATE = path.join(SSD, "17-MIGRATION-LOGS", "replication-state.json");
const LEDGER = path.join(SSD, "17-MIGRATION-LOGS", "replication-ledger.jsonl");
const QUARANTINE = path.join(SSD, "17-MIGRATION-LOGS", "quarantine");

const now = () => new Date().toISOString();
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

const loadJson = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : d; } catch { return d; } };
const sha256 = (f) => createHash("sha256").update(readFileSync(f)).digest("hex").toUpperCase();

function record(entry) {
  mkdirSync(path.dirname(LEDGER), { recursive: true });
  appendFileSync(LEDGER, JSON.stringify({ at: now(), ...entry }) + "\n");
}

/** Count CSV data rows honouring quoted fields — POR notes contain newlines. */
function countCsvRows(file) {
  const text = readFileSync(file, "utf8");
  let rows = 0, q = false, cur = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') i++; else q = false; } continue; }
    if (ch === '"') { q = true; cur = true; }
    else if (ch === "\n") { if (cur) rows++; cur = false; }
    else if (ch !== "\r") cur = true;
  }
  if (cur) rows++;
  return Math.max(0, rows - 1); // minus header
}

// ---------------------------------------------------------------- verify
function verifyBatch(dir) {
  const problems = [];
  if (!existsSync(path.join(dir, "READY")))
    return { ok: false, problems: ["no READY marker — writer did not finish"] };

  const manifestPath = path.join(dir, "MANIFEST.json");
  if (!existsSync(manifestPath)) return { ok: false, problems: ["MANIFEST.json missing"] };
  const m = loadJson(manifestPath, null);
  if (!m) return { ok: false, problems: ["MANIFEST.json unreadable"] };

  if (m.status !== "COMPLETE") problems.push(`manifest status ${m.status} — a partial batch is never promoted`);
  if (m.read_only !== true) problems.push("manifest does not assert a read-only extraction");

  for (const t of m.tables || []) {
    const f = path.join(dir, t.file);
    if (!existsSync(f)) { problems.push(`${t.table}: file missing`); continue; }
    const h = sha256(f);
    if (t.sha256 && h !== t.sha256) { problems.push(`${t.table}: sha256 mismatch — corrupted in transit`); continue; }
    const rows = countCsvRows(f);
    if (typeof t.rows_written === "number" && rows !== t.rows_written)
      problems.push(`${t.table}: row count ${rows} != manifest ${t.rows_written} — truncated`);
    // Snapshot tables must be whole; incremental deliberately carry a subset.
    if ((t.mode === "snapshot" || t.mode === "full") &&
        typeof t.source_total_rows === "number" && rows !== t.source_total_rows)
      problems.push(`${t.table}: snapshot has ${rows} of ${t.source_total_rows} source rows — incomplete`);
  }
  return { ok: problems.length === 0, problems, manifest: m };
}

// ---------------------------------------------------------------- promote
function promote(dir, manifest) {
  mkdirSync(MIRROR, { recursive: true });
  const applied = [];
  for (const t of manifest.tables || []) {
    const src = path.join(dir, t.file);
    const dst = path.join(MIRROR, t.file);
    if (t.mode === "snapshot" || t.mode === "full") {
      // Whole-table replacement — the batch IS the table.
      copyFileSync(src, dst);
      applied.push({ table: t.table, mode: t.mode, rows: t.rows_written, action: "replaced" });
    } else {
      // Incremental: keep the delta addressable. Merging on the Mac would
      // silently invent a table state POR never produced, so deltas are stored
      // alongside the last full and reconciled explicitly.
      const deltaDir = path.join(MIRROR, "_deltas", t.table);
      mkdirSync(deltaDir, { recursive: true });
      copyFileSync(src, path.join(deltaDir, `${manifest.run_id}.csv`));
      applied.push({ table: t.table, mode: "incremental", rows: t.rows_written, action: "delta stored" });
    }
  }
  return applied;
}

function quarantine(dir, problems) {
  mkdirSync(QUARANTINE, { recursive: true });
  const name = path.basename(dir);
  writeFileSync(path.join(QUARANTINE, `${name}.json`),
    JSON.stringify({ at: now(), batch: dir, problems }, null, 2));
}

// ---------------------------------------------------------------- status
function status() {
  const st = loadJson(STATE, { batches: [], last_success: null });
  const mirrorFiles = existsSync(MIRROR) ? readdirSync(MIRROR).filter((f) => f.endsWith(".csv")) : [];
  const ageH = st.last_success ? ((Date.now() - Date.parse(st.last_success)) / 3600000) : null;
  const freshness = ageH == null ? "NEVER" : ageH < 1 ? "LIVE" : ageH < 24 ? "STALE" : "VERY_STALE";
  console.log("POR REPLICATION STATUS");
  console.log(`  share reachable   : ${existsSync(SHARE) ? "yes" : "NO — " + SHARE}`);
  console.log(`  SSD reachable     : ${existsSync(SSD) ? "yes" : "NO — " + SSD}`);
  console.log(`  mirror tables     : ${mirrorFiles.length}`);
  console.log(`  last success      : ${st.last_success || "never"}`);
  console.log(`  freshness         : ${freshness}${ageH != null ? ` (${ageH.toFixed(1)}h)` : ""}`);
  console.log(`  batches ingested  : ${(st.batches || []).length}`);
  const q = existsSync(QUARANTINE) ? readdirSync(QUARANTINE).length : 0;
  console.log(`  quarantined       : ${q}`);
  return freshness;
}

// ---------------------------------------------------------------- main
if (argv.includes("--status")) { status(); process.exit(0); }

if (!existsSync(SHARE)) {
  console.log(`replication: share not mounted (${SHARE}) — nothing to ingest`);
  record({ event: "share_unreachable", share: SHARE });
  process.exit(0);
}
if (!existsSync(SSD)) {
  console.log(`replication: SSD not mounted (${SSD}) — refusing to ingest`);
  record({ event: "ssd_unreachable", ssd: SSD });
  process.exit(1);
}

const st = loadJson(STATE, { batches: [], last_success: null });
const seen = new Set(st.batches || []);
const batchRoot = path.join(SHARE, "batches");
const candidates = existsSync(batchRoot)
  ? readdirSync(batchRoot).filter((b) => !seen.has(b)).sort()
  : [];

if (!candidates.length) {
  console.log("replication: no new batches");
  process.exit(0);
}

let ingested = 0, rejected = 0;
for (const b of candidates) {
  const dir = path.join(batchRoot, b);
  const v = verifyBatch(dir);
  if (!v.ok) {
    console.log(`REJECT ${b}`);
    for (const p of v.problems) console.log(`   · ${p}`);
    if (!dryRun) { quarantine(dir, v.problems); record({ event: "batch_rejected", batch: b, problems: v.problems }); }
    rejected++;
    continue;
  }
  if (dryRun) { console.log(`WOULD INGEST ${b} — ${v.manifest.tables.length} table(s)`); continue; }
  const applied = promote(dir, v.manifest);
  st.batches = [...(st.batches || []), b];
  st.last_success = now();
  mkdirSync(path.dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(st, null, 2));
  record({ event: "batch_ingested", batch: b, tables: applied.length, applied });
  console.log(`INGEST ${b} — ${applied.length} table(s)`);
  ingested++;
}

if (!dryRun) {
  console.log();
  status();
}
process.exit(rejected > 0 ? 1 : 0);
