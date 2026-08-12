// REAL Cursor worker — invokes the official Cursor CLI (`cursor-agent`) headless, locally,
// inside the isolated git worktree. No cloud: cursor-agent runs on this Mac against the
// local checkout. Deterministic wrapper; cursor-agent is the model. Never fakes: if the CLI
// isn't installed/authenticated it exits BLOCKED (code 3) and the dispatcher reports it.
//
// Auth: CURSOR_API_KEY (owner-provided, via env or gitignored runtime/.cursor-secret) — the
// value is never logged or placed in a task record.
import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const { TASK_ID, ACTION, WORKTREE, CP_DIR, REPO } = process.env;
const cp = (...a) => spawnSync("node", [path.join(CP_DIR, "control-plane.mjs"), ...a], { encoding: "utf8", stdio: "inherit" });

// --- runtime availability (install + auth) — no faking ---
const has = spawnSync("cursor-agent", ["--version"], { encoding: "utf8" });
if (has.status !== 0) { console.error("BLOCKED: cursor-agent CLI not installed (owner: install the Cursor CLI)"); process.exit(3); }
// Auth: prefer a persisted `cursor-agent login`; fall back to CURSOR_API_KEY / gitignored secret file.
let apiKey = process.env.CURSOR_API_KEY || "";
const secretFile = path.join(path.dirname(new URL(import.meta.url).pathname), "..", ".cursor-secret");
if (!apiKey && existsSync(secretFile)) apiKey = readFileSync(secretFile, "utf8").trim();
if (!apiKey) {
  const st = spawnSync("cursor-agent", ["status"], { encoding: "utf8", timeout: 15000 });
  const loggedIn = st.status === 0 && /logged in/i.test((st.stdout || "") + (st.stderr || ""));
  if (!loggedIn) { console.error("BLOCKED: cursor-agent not authenticated (owner: `cursor-agent login` or set CURSOR_API_KEY)"); process.exit(3); }
}

// --- task prompt (tight, harmless, isolated) ---
const prompts = {
  IMPLEMENT: `You are in an isolated git worktree for task ${TASK_ID}. Make ONLY this harmless change: create a file named AI_AUTONOMY_SMOKE_TEST.md whose contents are a markdown title plus the exact lines "task: ${TASK_ID}" and "created_by: cursor-agent". Do NOT modify any other file, do NOT run network/deploy/install commands, do NOT touch git config or remotes. Then stop.`,
  REPAIR: `In this worktree, append a line "VERIFIED-MARKER: repaired" to AI_AUTONOMY_SMOKE_TEST.md. Change nothing else. Then stop.`,
};
const prompt = prompts[ACTION] || prompts.IMPLEMENT;

cp("claim", TASK_ID, "cursor");
cp("transition", TASK_ID, "cursor", "IN_PROGRESS");

// run the real Cursor agent headless, applying changes, in the worktree
const runEnv = { ...process.env }; if (apiKey) runEnv.CURSOR_API_KEY = apiKey; // else rely on persisted login
const run = spawnSync("cursor-agent", ["-p", "--force", "--output-format", "text", prompt], {
  encoding: "utf8", cwd: WORKTREE, timeout: 180000, env: runEnv,
});

// evidence: the agent's summary + the actual git diff it produced (deterministic proof)
const diff = spawnSync("git", ["-C", WORKTREE, "diff", "--stat"], { encoding: "utf8" }).stdout || "";
const fixture = path.join(WORKTREE, "AI_AUTONOMY_SMOKE_TEST.md");
const testExit = spawnSync("test", ["-f", fixture]).status;
const ev = path.join(CP_DIR, "EVIDENCE", `${TASK_ID}.result.md`);
if (!existsSync(path.dirname(ev))) mkdirSync(path.dirname(ev), { recursive: true });
writeFileSync(ev, `# ${TASK_ID} result (cursor-agent, real)\nagent exit: ${run.status}\nfixture present: ${testExit === 0}\nbranch: agent/cursor/${TASK_ID}\n\ngit diff --stat:\n${diff}\n\nagent summary (truncated):\n${(run.stdout || run.stderr || "").slice(0, 1200)}\n`);

if (run.status !== 0 || testExit !== 0) {
  console.error(`cursor-agent run incomplete (exit ${run.status}, fixture ${testExit === 0})`);
  process.exit(1); // dispatcher will retry; not certified
}
cp("transition", TASK_ID, "cursor", "READY_FOR_VERIFICATION", `--evidence=${ev}`, "--claim=cursor-agent produced the change in isolated worktree");
