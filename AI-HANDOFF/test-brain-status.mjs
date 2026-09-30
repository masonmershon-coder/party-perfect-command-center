#!/usr/bin/env node
// Hermetic tests for the brain data-freshness contract.
//
//   node AI-HANDOFF/test-brain-status.mjs
//
// HERMETIC BY CONSTRUCTION:
//   · fixtures only — every source object below is a literal in this file
//   · `now` is injected, so results do not drift with wall-clock time
//   · no network, no Redis, no POR, no SQL, no production API, no keychain,
//     no .env read, no child process, no filesystem write
//   · importing brain-status.mjs runs no probe; probes are CLI-only by design,
//     and test 6 asserts that property mechanically rather than trusting it
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, ageMinutes, grade, classify, isCurrent, presentationGuard } from "./brain-status.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-09-30T12:00:00.000Z");        // frozen clock
const ago = (mins) => new Date(NOW - mins * 60000).toISOString();

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e.message).split("\n")[0]}`); fail++; }
};

// ---- 1. recent source -> LIVE
t("1. a source synced minutes ago is LIVE", () => {
  const src = { name: "ops snapshot", syncedAt: ago(5) };
  assert.equal(ageMinutes(src.syncedAt, NOW), 5);
  assert.equal(classify(src, NOW), "LIVE");
  assert.equal(isCurrent(src, NOW), true);
  assert.equal(presentationGuard(src, NOW).ok, true, "LIVE needs no caveat");
  // boundary: exactly at the LIVE limit is still LIVE
  assert.equal(classify({ syncedAt: ago(LIMITS.LIVE) }, NOW), "LIVE");
});

// ---- 2. 1-24 hour source -> STALE
t("2. a source 1-24 hours old is STALE, and carries a cutoff caveat", () => {
  for (const mins of [LIMITS.LIVE + 1, 120, 600, LIMITS.STALE]) {
    assert.equal(classify({ syncedAt: ago(mins) }, NOW), "STALE", `${mins}m should be STALE`);
  }
  const g = presentationGuard({ name: "transaction detail", syncedAt: ago(300) }, NOW);
  assert.equal(g.ok, false);
  assert.match(g.caveat, /STALE/);
  assert.match(g.caveat, /cutoff date/i, "a STALE figure must be quoted with its cutoff");
});

// ---- 3. older source -> FROZEN
t("3. a source older than 24h is FROZEN", () => {
  assert.equal(classify({ syncedAt: ago(LIMITS.STALE + 1) }, NOW), "FROZEN");
  assert.equal(classify({ syncedAt: ago(50 * 1440) }, NOW), "FROZEN", "50 days is FROZEN");
  assert.equal(isCurrent({ syncedAt: ago(50 * 1440) }, NOW), false);
});

// ---- 4. missing / unreachable -> UNKNOWN or OFFLINE
t("4. missing timestamp is UNKNOWN; unreachable source is OFFLINE", () => {
  assert.equal(classify({ name: "no timestamp" }, NOW), "UNKNOWN");
  assert.equal(classify({ syncedAt: null }, NOW), "UNKNOWN");
  assert.equal(classify({ syncedAt: "not-a-date" }, NOW), "UNKNOWN", "unparseable must not read as LIVE");
  assert.equal(classify({ reachable: false }, NOW), "OFFLINE");
  // a dead source holding a recent timestamp is still OFFLINE, never LIVE
  assert.equal(classify({ reachable: false, syncedAt: ago(1) }, NOW), "OFFLINE",
    "reachability must dominate a stale-but-recent timestamp");
  for (const s of [{ name: "x" }, { reachable: false, name: "y" }]) {
    assert.equal(presentationGuard(s, NOW).ok, false);
  }
});

// ---- 5. FROZEN data cannot be presented as current
t("5. FROZEN data cannot be presented as current", () => {
  const frozen = { name: "POR transaction detail", syncedAt: ago(50 * 1440) };
  assert.equal(isCurrent(frozen, NOW), false, "isCurrent must refuse FROZEN");
  const g = presentationGuard(frozen, NOW);
  assert.equal(g.ok, false, "the guard must refuse");
  assert.equal(g.status, "FROZEN");
  assert.match(g.caveat, /do NOT present its figures as current/i);
  assert.match(g.caveat, /2026-08-1[0-9]|as of \d{4}-\d{2}-\d{2}/, "the caveat must name the cutoff date");
  // and no status other than LIVE may pass the guard
  for (const mins of [LIMITS.LIVE + 1, LIMITS.STALE + 1, 99999]) {
    assert.equal(presentationGuard({ syncedAt: ago(mins) }, NOW).ok, false);
  }
});

// ---- 6. the module itself performs no I/O on import
t("6. no test path reads credentials, Redis, POR, SQL or a production API", () => {
  const src = readFileSync(path.join(HERE, "brain-status.mjs"), "utf8");
  // every side-effecting call must sit inside a function body, never at module top level
  const topLevel = src.split("\n").filter((l) => /^(const|let|var|await)\s/.test(l));
  for (const line of topLevel) {
    assert.doesNotMatch(line, /\bfetch\(|execFileSync\(|readFileSync\(|probe[A-Z]/,
      `top-level I/O would run on import: ${line.trim().slice(0, 60)}`);
  }
  // probes must be reachable only from the CLI guard
  assert.match(src, /import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`/,
    "probes must be behind a CLI guard");
  const cliIdx = src.indexOf("if (import.meta.url ===");
  for (const p of ["probeOpsSnapshot(", "probeCrmMirror(", "probeDirectSql("]) {
    const calls = [...src.matchAll(new RegExp(p.replace("(", "\\("), "g"))].map((m) => m.index);
    const invocations = calls.filter((i) => !/function\s+$/.test(src.slice(Math.max(0, i - 20), i)));
    for (const i of invocations) assert.ok(i > cliIdx, `${p} is invoked outside the CLI guard`);
  }
  // This test file must itself be free of live-system references. The needles are
  // assembled from fragments so that checking for them does not plant them.
  const self = readFileSync(path.join(HERE, "test-brain-status.mjs"), "utf8");
  const needles = [["KV_REST", "_API"], ["find-generic", "-password"], ["partyperfect", ".app"],
                   ["kituwa", ".app"], ["96", "76"], ["enterprise", "-winrm"], ["192.168", ".0.5"]];
  for (const parts of needles) {
    const n = parts.join("");
    assert.ok(!self.includes(n), `test file must not reference ${parts[0]}...`);
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
