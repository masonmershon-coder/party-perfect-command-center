// STUB verifier standing in for the real Codex-local runtime — HARNESS TEST ONLY.
// Independently checks the Cursor-produced fixture and enforces a controlled acceptance
// criterion. Rejects once (missing VERIFIED-MARKER), certifies after repair.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
const { TASK_ID, WORKTREE, CP_DIR } = process.env;
const cp = (...a) => spawnSync("node", [path.join(CP_DIR, "control-plane.mjs"), ...a], { encoding: "utf8", stdio: "inherit" });
const fixture = path.join(WORKTREE, "AI_AUTONOMY_SMOKE_TEST.md");

cp("transition", TASK_ID, "codex", "VERIFYING");
const body = existsSync(fixture) ? readFileSync(fixture, "utf8") : "";
const hasFixture = body.includes(`task: ${TASK_ID}`);
const hasMarker = body.includes("VERIFIED-MARKER");

if (!hasFixture) {
  cp("transition", TASK_ID, "codex", "FAILED", "--error=fixture missing/incorrect");
  cp("transition", TASK_ID, "codex", "NEEDS_FIX");
} else if (!hasMarker) {
  // controlled first rejection — routes back to Cursor automatically
  cp("transition", TASK_ID, "codex", "FAILED", "--error=acceptance: missing VERIFIED-MARKER line");
  cp("transition", TASK_ID, "codex", "NEEDS_FIX");
} else {
  cp("transition", TASK_ID, "codex", "CERTIFIED_PASS", "--result=fixture + VERIFIED-MARKER present; independently confirmed");
}
