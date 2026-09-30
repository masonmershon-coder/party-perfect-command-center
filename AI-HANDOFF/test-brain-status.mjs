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
import { LIMITS, LIVE_MS, STALE_MS, ageMs, ageMinutes, grade, isFuture, classify, isCurrent,
         presentationGuard, configStatus, redactSource, buildReport, renderText } from "./brain-status.mjs";

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


// ---- 7. output contains cutoff timestamps
t("7. text and JSON output both carry cutoff timestamps", () => {
  const sources = [{ name: "ops", syncedAt: ago(5) }, { name: "detail", syncedAt: ago(50 * 1440) }];
  const rep = buildReport(sources, NOW);
  for (const s of rep.sources) {
    assert.ok(s.cutoff, `${s.name} must carry a cutoff`);
    assert.match(s.cutoff, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "cutoff must be an ISO timestamp");
  }
  const txt = renderText(rep);
  assert.match(txt, /cutoff 2026-09-30T11:55:00Z/, "LIVE line shows its cutoff");
  assert.match(txt, /cutoff 2026-08-11T12:00:00Z/, "FROZEN line shows its cutoff");
  // a source with no timestamp must still render a cutoff field, not silently omit it
  const none = renderText(buildReport([{ name: "nothing" }], NOW));
  assert.match(none, /cutoff —/);
});

// ---- 8. JSON output contains no tokens, passwords or PII
t("8. JSON output carries no tokens, passwords or PII", () => {
  // a probe that wrongly attaches sensitive fields must not leak them
  const dirty = {
    name: "ops", syncedAt: ago(5),
    apiToken: "tok_" + "A".repeat(24), password: "hunter2", sessionCookie: "sid=abc",
    customerEmail: "someone@example.com", customerPhone: "918-555-1234", ownerPin: "1234",
    serviceRoleKey: "srk_" + "B".repeat(24), note: "safe note",
  };
  const out = redactSource(dirty, NOW);
  for (const k of ["apiToken", "password", "sessionCookie", "customerEmail", "customerPhone", "ownerPin", "serviceRoleKey"]) {
    assert.ok(!(k in out), `${k} must be dropped from output`);
  }
  assert.equal(out.note, "safe note", "allow-listed fields survive");
  const json = JSON.stringify(buildReport([dirty], NOW));
  for (const v of ["hunter2", "sid=abc", "someone@example.com", "918-555-1234", "1234", "tok_", "srk_"]) {
    assert.ok(!json.includes(v), `value ${v} leaked into JSON`);
  }
  // the render path must be equally safe
  assert.ok(!renderText(buildReport([dirty], NOW)).includes("hunter2"));
});

// ---- 10. missing environment configuration fails truthfully
t("10. missing configuration fails truthfully, never silently LIVE", () => {
  const cfg = configStatus({}, { name: "transaction detail", needs: ["KV_REST" + "_API_URL"] });
  assert.equal(cfg.configured, false);
  assert.equal(cfg.reachable, undefined, "unconfigured must NOT claim we probed it");
  assert.match(cfg.note, /not configured/i);
  assert.match(cfg.note, /absent/i, "the note must name what is missing");
  assert.equal(classify(cfg, NOW), "UNKNOWN", "unconfigured = never looked = UNKNOWN, never LIVE");
  assert.equal(presentationGuard(cfg, NOW).ok, false);
  // and when configuration IS present it does not fabricate freshness
  const ok = configStatus({ ["KV_REST" + "_API_URL"]: "x" }, { name: "d", needs: ["KV_REST" + "_API_URL"] });
  assert.equal(ok.configured, true);
  assert.equal(classify(ok, NOW), "UNKNOWN", "configured but unprobed is UNKNOWN, not LIVE");
});


// ---- 11. exact boundaries, to the millisecond
t("11. LIVE/STALE/FROZEN boundaries are exact, not rounded minutes", () => {
  const at = (ms) => ({ name: "b", syncedAt: new Date(NOW - ms).toISOString() });
  assert.equal(classify(at(LIVE_MS), NOW), "LIVE", "exactly 60m is LIVE");
  assert.equal(classify(at(LIVE_MS + 1), NOW), "STALE", "60m + 1ms is STALE");
  assert.equal(classify(at(STALE_MS), NOW), "STALE", "exactly 24h is STALE");
  assert.equal(classify(at(STALE_MS + 1), NOW), "FROZEN", "24h + 1ms is FROZEN");
  // the rounding bug this replaces: 60m30s must NOT read as LIVE
  assert.equal(classify(at(60 * 60_000 + 30_000), NOW), "STALE", "60m30s must not round down to LIVE");
  assert.equal(ageMs(at(LIVE_MS + 1).syncedAt, NOW), LIVE_MS + 1, "exact ms is preserved");
});

// ---- 12. future timestamps
t("12. a future timestamp is UNKNOWN with a clock-skew caveat", () => {
  const future = { name: "ops snapshot", syncedAt: new Date(NOW + 5 * 60_000).toISOString() };
  assert.equal(isFuture(future.syncedAt, NOW), true);
  assert.ok(ageMs(future.syncedAt, NOW) < 0, "future age is negative");
  assert.equal(classify(future, NOW), "UNKNOWN", "future must never read as LIVE");
  const g = presentationGuard(future, NOW);
  assert.equal(g.ok, false);
  assert.equal(g.skew, true);
  assert.match(g.caveat, /FUTURE/);
  assert.match(g.caveat, /clock skew/i);
  assert.equal(redactSource(future, NOW).clock_skew, true, "JSON flags the skew");
  // one millisecond into the future is still future
  assert.equal(classify({ syncedAt: new Date(NOW + 1).toISOString() }, NOW), "UNKNOWN");
});

// ---- 13. missing POR host/port -> UNKNOWN, without probing
t("13. missing POR host/port yields UNKNOWN and performs no probe", () => {
  const cfg = configStatus({}, { name: "Direct POR SQL", needs: ["POR_SQL_HOST", "POR_SQL_PORT"] });
  assert.equal(cfg.configured, false);
  assert.equal(cfg.reachable, undefined, "must not claim a probe result");
  assert.equal(classify(cfg, NOW), "UNKNOWN");
  assert.match(cfg.note, /POR_SQL_HOST/);
  assert.match(cfg.note, /POR_SQL_PORT/);
  assert.match(presentationGuard(cfg, NOW).caveat, /NOT CONFIGURED/);
  // partial configuration is still not configured
  assert.equal(configStatus({ POR_SQL_HOST: "h" }, { needs: ["POR_SQL_HOST", "POR_SQL_PORT"] }).configured, false);
  // the source must carry no hardcoded address fallback
  const src = readFileSync(path.join(HERE, "brain-status.mjs"), "utf8");
  assert.doesNotMatch(src, /POR_SQL_HOST\s*\|\|/, "no host fallback allowed");
  assert.doesNotMatch(src, /POR_SQL_PORT\s*\|\|/, "no port fallback allowed");
  assert.doesNotMatch(src, /\b\d{1,3}(\.\d{1,3}){3}\b/, "no hardcoded IP address allowed");
});

// ---- 14. read-only Redis token is required, with no read-write fallback
t("14. missing read-only token yields UNKNOWN and never falls back to the write token", () => {
  const RO = "KV_REST" + "_API_READ_ONLY_TOKEN", URL = "KV_REST" + "_API_URL", RW = "KV_REST" + "_API_TOKEN";
  const cfg = configStatus({ [URL]: "https://example.invalid" }, { name: "detail", needs: [URL, RO] });
  assert.equal(cfg.configured, false, "url alone is not enough");
  assert.equal(classify(cfg, NOW), "UNKNOWN");
  assert.match(cfg.note, /READ_ONLY/);
  // supplying ONLY the read-write token must not satisfy the requirement
  const rwOnly = configStatus({ [URL]: "https://example.invalid", [RW]: "x" }, { needs: [URL, RO] });
  assert.equal(rwOnly.configured, false, "read-write token must not substitute for read-only");
  // and the source must contain no such fallback
  const src = readFileSync(path.join(HERE, "brain-status.mjs"), "utf8");
  assert.doesNotMatch(src, new RegExp(RO + "\\s*\\|\\|"), "no fallback from read-only to read-write token");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
