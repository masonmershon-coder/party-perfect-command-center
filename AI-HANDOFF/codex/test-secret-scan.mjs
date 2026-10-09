#!/usr/bin/env node
// Secret classification tests. HERMETIC -- pure functions, synthetic values only.
// Every credential-shaped string is assembled at runtime so this file never contains one.
//
//   node test-secret-scan.mjs
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findSecretTokens, classifyFile, maskToken, isKnownFixture, KNOWN_FIXTURES } from "./secret-scan.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name} ${extra}`); fail++; }
};
const rand = (n, cs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") =>
  [...randomBytes(n)].map((b) => cs[b % cs.length]).join("");
const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const j = (...p) => p.join("");
const p0 = (file, body) => classifyFile(file, body).filter((f) => f.severity === "P0");
const p2 = (file, body) => classifyFile(file, body).filter((f) => f.severity === "P2");

console.log("SECRET SCAN — classification tests (synthetic only)\n");

console.log("hyphenated provider formats are detected and stay P0");
for (const [label, tok] of [
  ["OpenAI project key", j("sk", "-proj-", rand(48), "_", rand(20))],
  ["Anthropic key", j("sk", "-ant-api03-", rand(90), "-", rand(6))],
  ["OpenAI service-account key", j("sk", "-svcacct-", rand(40))],
  ["xAI key", j("xai", "-", rand(80))],
]) {
  const body = `const k = "${tok}";`;
  ok(`${label}: detected whole`, findSecretTokens(body).includes(tok));
  ok(`${label}: P0`, p0("lib/x.ts", body).length === 1);
}

console.log("short / low-entropy / test-looking credential shapes stay P0");
for (const [label, tok] of [
  ["random 20-char sk- token", j("sk", "-", rand(20))],
  ["sk- token starting 'abc' (not allowlisted)", j("sk", "-abc", rand(16))],
  ["repeating-char xai- token", j("xai", "-", "a".repeat(20))],
]) {
  ok(`${label}: P0 even in a test file`, p0("scripts/some.test.ts", `x = "${tok}"`).length === 1);
}

console.log("other supported formats");
for (const [label, tok] of [
  ["AWS access key", j("AK", "IA", rand(16, UP))],
  ["GitHub token", j("gh", "p_", rand(36))],
  ["Stripe live key", j("sk", "_live_", rand(24))],
  ["Slack token", j("xo", "xb-", rand(12, "0123456789"), "-", rand(24))],
  ["private key header", j("-----BEGIN ", "PRIVATE KEY-----")],
]) {
  ok(`${label}: P0`, p0("lib/x.ts", `v = "${tok}"`).length === 1);
}

console.log("ordinary words containing the prefixes are not matched");
ok("'task-' / 'desk-' identifiers ignored", findSecretTokens("task-0123456789abcdefghij desk-0123456789abcdefghij").length === 0);

console.log("PostgreSQL URLs");
const pg = j("postgres", "ql://svc:", rand(20), "@db.example.invalid:5432/app");
ok("URL with password is P0", p0("scripts/foundation/foundation.test.mjs", `const S = "${pg}";`).length === 1);
const realFixture = readFileSync(path.join(REPO, "scripts/foundation/foundation.test.mjs"), "utf8");
const pgInRepo = findSecretTokens(realFixture).filter((t) => t.startsWith("postgres"));
ok("repo's existing postgres fixture is NOT allowlisted (needs a human)", pgInRepo.length > 0 &&
  pgInRepo.every((t) => !isKnownFixture(t, "scripts/foundation/foundation.test.mjs")));

console.log("explicit known fixtures");
for (const f of [...new Set(KNOWN_FIXTURES.map((k) => k.file))]) {
  const body = readFileSync(path.join(REPO, f), "utf8");
  const nonPg = findSecretTokens(body).filter((t) => !t.startsWith("postgres"));
  ok(`${f}: every sk-/xai- hit is an allowlisted fixture`, nonPg.length > 0 && nonPg.every((t) => isKnownFixture(t, f)));
  ok(`${f}: reported at P2`, p2(f, body).length === 1);
}
const fixtureFile = KNOWN_FIXTURES[0].file;
const fixtureTok = findSecretTokens(readFileSync(path.join(REPO, fixtureFile), "utf8"))
  .find((t) => isKnownFixture(t, fixtureFile));
ok("an allowlisted value in a DIFFERENT file is P0", p0("lib/other.ts", `k = "${fixtureTok}"`).length === 1);
ok("allowlist stores digests, not tokens", KNOWN_FIXTURES.every((k) => /^[0-9a-f]{64}$/.test(k.sha256)));

console.log("masking / no-leak");
const secrets = [j("sk", "-proj-", rand(60)), j("xai", "-", rand(19)), pg];
const out = JSON.stringify(classifyFile("lib/leak.ts", secrets.map((s) => `v="${s}"`).join("\n")));
ok("no finding contains a full token", secrets.every((s) => !out.includes(s)));
ok("no finding contains any 8-char run of a token body", secrets.every((s) => {
  for (let i = 4; i + 8 <= s.length; i++) if (out.includes(s.slice(i, i + 8))) return false;
  return true;
}));
ok("mask shows at most 4 leading + 2 trailing chars", /^.{0,4}\.\.\..{2} \(len \d+\)$/.test(maskToken(secrets[0])));
ok("mask of a short token reveals at most a quarter of it", maskToken(j("sk", "-", rand(16))).split("...")[0].length <= 4);
ok("findings carry line numbers", /line 2: /.test(out));

console.log("\nscanner hygiene");
const self = readFileSync(fileURLToPath(import.meta.url), "utf8");
ok("this test file contains no credential-shaped literal", findSecretTokens(self).length === 0);
const mod = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "secret-scan.mjs"), "utf8");
ok("secret-scan.mjs contains no credential-shaped literal", findSecretTokens(mod).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
