#!/usr/bin/env node
// Cursor activity recorder — DETERMINISTIC. Closes OBS-CURSOR-VISIBILITY-001.
//
// On 2026-08-13 Cursor produced 280 insertions of jobs work while the control
// plane recorded ZERO Cursor runs. Nightly cleanup found it only by forensic
// git inspection. AI-HANDOFF can only protect work it knows exists.
//
//   node activity-recorder.mjs session-start
//   node activity-recorder.mjs file-edit <path>
//   node activity-recorder.mjs status
//
// Deliberately NOT a keystroke logger. It records task-LEVEL signal:
// a session opens, which source files were touched, and once the work crosses
// a materiality threshold it registers an ACTIVITY record in the control plane
// so nightly cleanup and the dispatcher see it natively.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HANDOFF = path.dirname(HERE);
const REPO = path.dirname(HANDOFF);
const CP = path.join(HANDOFF, "control-plane.mjs");
const ACTIVITY_DIR = path.join(HERE, ".activity");
const LOG = path.join(HANDOFF, "CURSOR_ACTIVITY.jsonl");

const now = () => new Date().toISOString();

/** Files whose edits represent real product work. Noise is ignored on purpose. */
const MATERIAL = /^(app|lib|components|scripts|por-sync-agent|supabase)\//;
const IGNORE = /(node_modules|\.next|\.git\/|package-lock\.json|\.log$|\.activity|AI-HANDOFF\/EVIDENCE)/;

/** Distinct material files before we register a control-plane record. */
const MATERIALITY_THRESHOLD = 3;

const sessionFile = () => {
  mkdirSync(ACTIVITY_DIR, { recursive: true });
  // One bucket per day per checkout — keeps a long Cursor session coherent
  // without inventing a session id the hook cannot give us reliably.
  return path.join(ACTIVITY_DIR, `${now().slice(0, 10)}.json`);
};

function load() {
  const f = sessionFile();
  if (!existsSync(f)) return { started_at: now(), files: [], registered_task: null };
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return { started_at: now(), files: [], registered_task: null };
  }
}
const save = (s) => writeFileSync(sessionFile(), JSON.stringify(s, null, 2));

const log = (entry) => {
  mkdirSync(path.dirname(LOG), { recursive: true });
  appendFileSync(LOG, JSON.stringify({ at: now(), ...entry }) + "\n");
};

const plane = (args) => {
  try {
    return execFileSync("node", [CP, ...args], { cwd: REPO, encoding: "utf8" }).trim();
  } catch (e) {
    return `ERR: ${e.message}`;
  }
};

function heartbeat(state, taskId) {
  plane(["heartbeat", "cursor", state, taskId || ""]);
}

/**
 * Register a control-plane record once the session is materially productive.
 * Idempotent: one record per day-bucket, never a task per file.
 */
function maybeRegister(state) {
  if (state.registered_task) return state;
  const material = state.files.filter((f) => MATERIAL.test(f));
  if (material.length < MATERIALITY_THRESHOLD) return state;

  const id = `CURSOR-ACTIVITY-${now().slice(0, 10).replace(/-/g, "")}`;
  const existing = (() => {
    try {
      const st = JSON.parse(readFileSync(path.join(HANDOFF, "MASTER_STATE.json"), "utf8"));
      return Boolean(st.tasks?.[id]);
    } catch {
      return false;
    }
  })();

  if (!existing) {
    plane([
      "create",
      JSON.stringify({
        task_id: id,
        subsystem: "command-center",
        objective: `Cursor GUI session touched ${material.length} source file(s) — registered automatically so the work is visible to the control plane and nightly cleanup.`,
        created_by: "cursor-activity-recorder",
        owner_agent: "cursor",
        verifier_agent: "codex",
        priority: "normal",
        risk_tier: 1,
        expected_evidence: "git diff of the touched files; this record exists so the work cannot be lost silently",
        evidence_paths: ["AI-HANDOFF/CURSOR_ACTIVITY.jsonl"],
        files: material.slice(0, 40),
      }),
    ]);
  }
  state.registered_task = id;
  log({ event: "registered", task_id: id, material_files: material.length });
  heartbeat("WORKING", id);
  return state;
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case "session-start": {
    const state = load();
    state.started_at = state.started_at || now();
    save(state);
    log({ event: "session_start", files_so_far: state.files.length });
    heartbeat("ONLINE", state.registered_task);
    console.log("cursor activity: session registered");
    break;
  }

  case "file-edit": {
    const raw = rest.join(" ").trim();
    if (!raw) break;
    const rel = raw.startsWith(REPO) ? path.relative(REPO, raw) : raw;
    if (IGNORE.test(rel)) break;
    let state = load();
    if (!state.files.includes(rel)) {
      state.files.push(rel);
      log({ event: "file_edit", file: rel });
    }
    state = maybeRegister(state);
    save(state);
    break;
  }

  case "status": {
    const state = load();
    const material = state.files.filter((f) => MATERIAL.test(f));
    console.log(`session started: ${state.started_at}`);
    console.log(`files touched:   ${state.files.length} (${material.length} material)`);
    console.log(`registered task: ${state.registered_task || "(below materiality threshold)"}`);
    if (material.length) console.log("material files:\n  " + material.slice(0, 20).join("\n  "));
    break;
  }

  case "sessions": {
    mkdirSync(ACTIVITY_DIR, { recursive: true });
    for (const f of readdirSync(ACTIVITY_DIR).filter((x) => x.endsWith(".json"))) {
      const s = JSON.parse(readFileSync(path.join(ACTIVITY_DIR, f), "utf8"));
      console.log(`${f.replace(".json", "")}  files=${s.files.length}  task=${s.registered_task || "-"}`);
    }
    break;
  }

  default:
    console.error("usage: session-start | file-edit <path> | status | sessions");
    process.exit(2);
}
