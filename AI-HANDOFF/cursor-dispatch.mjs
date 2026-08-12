#!/usr/bin/env node
// Cursor dispatcher — DETERMINISTIC, NO AI reasoning. Wakes the OFFICIAL Cursor agent
// runtime for tasks owned by `cursor`. It does not implement anything itself; it only
// triggers Cursor's supported runtime with a narrow task context, then exits.
//
// Trigger path is chosen by env CURSOR_TRIGGER:
//   api    -> Cursor Background-Agent API (token via secret store ref CURSOR_AGENT_TOKEN_REF; never inline)
//   github -> open a repo issue/PR that @-mentions the Cursor agent (needs gh auth + Cursor GitHub app)
//   (unset)-> no runtime configured: report parked, change nothing (honest — Cursor is not autonomous yet)
//
// Run on a low-frequency trigger or fs-watch of MASTER_STATE.json — never a busy loop.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const state = existsSync(path.join(DIR, "MASTER_STATE.json")) ? JSON.parse(readFileSync(path.join(DIR, "MASTER_STATE.json"), "utf8")) : { tasks: {} };
const TRIGGER = (process.env.CURSOR_TRIGGER || "").toLowerCase();

// Tasks that need the Cursor runtime: owned by cursor, awaiting a worker or fresh repair.
const pending = Object.values(state.tasks).filter(
  (t) => t.owner_agent === "cursor" && ["WAITING_FOR_WORKER", "NEW", "NEEDS_FIX"].includes(t.status)
);

if (!pending.length) { console.log("cursor-dispatch: nothing pending"); process.exit(0); }

for (const t of pending) {
  const ctx = { task_id: t.task_id, objective: t.objective, evidence_paths: t.evidence_paths, branch: `agent/cursor/${t.task_id}` };
  if (TRIGGER === "api") {
    // Placeholder for Cursor's official Background-Agent API. Token comes from a store ref,
    // never inline. Wire the exact endpoint when Mason enables Cloud Agents.
    console.log(`cursor-dispatch: [api] would launch Cursor Cloud Agent for ${t.task_id} on ${ctx.branch} (token via ${process.env.CURSOR_AGENT_TOKEN_REF || "secret_store:cursor-agent-token"})`);
    // e.g. fetch(CURSOR_AGENT_API, { method:"POST", headers:{authorization:`Bearer ${token}`}, body: JSON.stringify(ctx) })
  } else if (TRIGGER === "github") {
    const body = `@cursor please work ${t.task_id} on branch ${ctx.branch}. Context: AI-HANDOFF/${(t.evidence_paths||[])[0]||""}. Follow CURSOR_QUEUE_CONSUMER.md. Do NOT deploy; open a draft PR and mark READY_FOR_VERIFICATION.`;
    const r = spawnSync("gh", ["issue", "create", "--title", `Cursor task ${t.task_id}`, "--body", body], { encoding: "utf8" });
    console.log(r.status === 0 ? `cursor-dispatch: [github] triggered ${t.task_id}` : `cursor-dispatch: [github] FAILED (${(r.stderr||"gh not ready").trim().slice(0,80)})`);
  } else {
    console.log(`cursor-dispatch: ${t.task_id} PARKED — no Cursor runtime configured (set CURSOR_TRIGGER=api|github after enabling Cloud Agents). Nothing changed.`);
  }
}
