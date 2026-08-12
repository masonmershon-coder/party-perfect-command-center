// Which OFFICIAL Cursor runtime can actually execute work right now.
//
// Detection only -- never asserts. If nothing is connected we say so and the
// dispatcher parks the task. There is no homemade "Cursor bot" fallback: if
// Cursor's supported runtime cannot run, Cursor is not autonomous, full stop.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

// Resolve the binary explicitly. The official installer puts cursor-agent in
// ~/.local/bin, which is NOT on every shell's PATH -- relying on PATH alone
// reported "not installed" while a working, logged-in runtime sat right there.
function resolveAgentBin() {
  if (process.env.CURSOR_AGENT_BIN) return process.env.CURSOR_AGENT_BIN;
  const home = process.env.HOME || "";
  const candidates = [
    path.join(home, ".local/bin/cursor-agent"),
    "/opt/homebrew/bin/cursor-agent",
    "/usr/local/bin/cursor-agent",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "cursor-agent"; // fall back to PATH lookup
}
export const CURSOR_AGENT_BIN = resolveAgentBin();

/** Official headless Cursor CLI (`cursor-agent`), run locally. */
export function probeCliRuntime() {
  const probe = spawnSync(CURSOR_AGENT_BIN, ["--version"], {
    encoding: "utf8",
    timeout: 20000,
  });
  if (probe.error?.code === "ENOENT")
    return {
      id: "cursor-cli",
      available: false,
      reason: `cursor-agent CLI not installed (looked for "${CURSOR_AGENT_BIN}")`,
      owner_action:
        "Install the official Cursor CLI, then run `cursor-agent login`.",
    };
  if (probe.error || probe.status !== 0)
    return {
      id: "cursor-cli",
      available: false,
      reason: `cursor-agent present but not usable: ${(probe.stderr || probe.error?.message || "").trim().slice(0, 160)}`,
      owner_action: "Run `cursor-agent login` to authenticate the CLI.",
    };

  // Installed AND authenticated are different things. `--version` succeeds while
  // logged out, so probe auth separately or the first real run fake-succeeds.
  const auth = spawnSync(CURSOR_AGENT_BIN, ["status"], {
    encoding: "utf8",
    timeout: 20000,
  });
  const blob = `${auth.stdout || ""}${auth.stderr || ""}`;
  const loggedOut = /not logged in|unauthenticated|please log in|login required/i.test(blob);
  if (auth.status !== 0 || loggedOut)
    return {
      id: "cursor-cli",
      available: false,
      version: (probe.stdout || "").trim(),
      reason: "cursor-agent installed but not logged in",
      owner_action: "Run `cursor-agent login` and complete the browser sign-in.",
    };

  return {
    id: "cursor-cli",
    available: true,
    version: (probe.stdout || "").trim(),
    mode: "local-headless",
  };
}

/** Cloud/Background Agents driven through GitHub (needs gh auth + Cursor GitHub app). */
export function probeCloudRuntime() {
  const gh = spawnSync("gh", ["auth", "status"], { encoding: "utf8", timeout: 20000 });
  if (gh.error?.code === "ENOENT")
    return {
      id: "cursor-cloud",
      available: false,
      reason: "gh CLI not installed",
      owner_action: "Install GitHub CLI, then run `gh auth login`.",
    };
  if (gh.status !== 0)
    return {
      id: "cursor-cloud",
      available: false,
      reason: "gh CLI not authenticated",
      owner_action: "Run `gh auth login` and authorize the repository.",
    };
  return { id: "cursor-cloud", available: true, mode: "github-cloud-agent" };
}

/**
 * Preferred runtime. CLI first: it is local, needs no GitHub grant, and keeps
 * the POR/SSD boundary trivially (nothing leaves the Mac).
 */
export function detectRuntime() {
  const forced = (process.env.CURSOR_TRIGGER || "").toLowerCase();
  const cli = probeCliRuntime();
  const cloud = probeCloudRuntime();

  if (forced === "github") return { chosen: cloud.available ? cloud : null, cli, cloud };
  if (forced === "cli") return { chosen: cli.available ? cli : null, cli, cloud };
  const chosen = cli.available ? cli : cloud.available ? cloud : null;
  return { chosen, cli, cloud };
}

/** The single owner action that would unblock things, or null if already fine. */
export function blockingOwnerAction(detected) {
  if (detected.chosen) return null;
  // Fewest steps wins: the CLI needs install+login; cloud needs gh auth + app + enablement.
  return detected.cli.owner_action || detected.cloud.owner_action;
}

export function stubRuntime() {
  // Only used by certify.sh --plumbing. Never selectable in normal operation.
  return existsSync(process.env.CURSOR_STUB || "") ? { id: "stub", available: true, mode: "stub" } : null;
}
