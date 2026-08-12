// STUB worker standing in for the real Cursor runtime — HARNESS TEST ONLY.
// Proves the dispatch→isolated-worktree→implement→test→evidence→READY loop mechanically.
// The REAL cursor-agent replaces this once installed+authed (same env contract).
import { spawnSync } from "node:child_process";
import { writeFileSync, appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const { TASK_ID, ACTION, WORKTREE, CP_DIR } = process.env;
const cp = (...a) => spawnSync("node", [path.join(CP_DIR, "control-plane.mjs"), ...a], { encoding: "utf8", stdio: "inherit" });
const fixture = path.join(WORKTREE, "AI_AUTONOMY_SMOKE_TEST.md");

if (ACTION === "IMPLEMENT") {
  cp("claim", TASK_ID, "cursor");
  cp("transition", TASK_ID, "cursor", "IN_PROGRESS");
  // harmless isolated change (NOTE: no VERIFIED-MARKER yet -> triggers the controlled rejection)
  writeFileSync(fixture, `# AI Autonomy Smoke Test\n\ntask: ${TASK_ID}\ncreated_by: stub-cursor (harness)\n`);
  const test = spawnSync("test", ["-f", fixture]); // harmless "test" step
  const ev = path.join(CP_DIR, "EVIDENCE", `${TASK_ID}.result.md`);
  if (!existsSync(path.dirname(ev))) mkdirSync(path.dirname(ev), { recursive: true });
  writeFileSync(ev, `# ${TASK_ID} result (stub-cursor)\nfixture: ${fixture}\ntest exit: ${test.status}\nbranch: agent/cursor/${TASK_ID}\n`);
  cp("transition", TASK_ID, "cursor", "READY_FOR_VERIFICATION", `--evidence=${ev}`, "--claim=stub created fixture + ran test");
} else if (ACTION === "REPAIR") {
  cp("claim", TASK_ID, "cursor");
  cp("transition", TASK_ID, "cursor", "IN_PROGRESS");
  if (existsSync(fixture) && !readFileSync(fixture, "utf8").includes("VERIFIED-MARKER"))
    appendFileSync(fixture, "\nVERIFIED-MARKER: repaired per Codex NEEDS_FIX\n");
  cp("transition", TASK_ID, "cursor", "READY_FOR_VERIFICATION", "--claim=repaired: added VERIFIED-MARKER");
}
