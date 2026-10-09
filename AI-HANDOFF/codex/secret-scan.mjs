// Secret classification for the weekly sweep. Pure functions -- no I/O -- so it can be
// tested hermetically (see test-secret-scan.mjs).
//
// The rule: an unknown credential-shaped string is ALWAYS P0. Length, entropy, prefix
// wording or the file being a test never downgrade it. The only P2 path is an exact,
// reviewed fixture: (tracked file path, sha256 of the token) listed in KNOWN_FIXTURES.
// Digests rather than the tokens themselves so this file is not a second copy.
import { createHash } from "node:crypto";

// Provider formats. Hyphen/underscore bodies cover sk-proj-, sk-ant-api03-, sk-svcacct-.
// The lookbehind stops matches inside ordinary words ("task-...", "desk-...").
export const SECRET_PATTERNS = [
  /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{16,}/g,
  /(?<![A-Za-z0-9_-])xai-[A-Za-z0-9_-]{16,}/g,
  /(?<![A-Za-z0-9])(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{30,}/g,
  /(?<![A-Za-z0-9])xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Z])/g,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/g,
  /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/g,
];

/** Reviewed test fixtures. Adding an entry requires a human to confirm the value is not live. */
export const KNOWN_FIXTURES = [
  { file: "AI-HANDOFF/governor/test-accounting.mjs", sha256: "6c2b82b5db2d55c4e1869eecd8b5d53af11425839bde5ee86a55d300c93e819e" },
  { file: "AI-HANDOFF/sentinel/test-sentinel.mjs", sha256: "6c2b82b5db2d55c4e1869eecd8b5d53af11425839bde5ee86a55d300c93e819e" },
  { file: "AI-HANDOFF/sentinel/test-sentinel.mjs", sha256: "32f4cf588c77f0941514cadc1cb18fa0e186716c93e067c22d9ef4e27718f506" },
  { file: "scripts/foundation/foundation.test.mjs", sha256: "52ddf3af90c58b50c2ef6510c8bdce81e021aef6c31a9e29a1ca3f9caf8e0dc6" },
  { file: "scripts/test-ai-cost.ts", sha256: "82be8a4d9cdebab78235e6d0618fdea34065fcb6f498073283ff4ec7376e551a" },
];

const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export function findSecretTokens(body) {
  const out = new Set();
  for (const re of SECRET_PATTERNS) for (const m of body.matchAll(re)) out.add(m[0]);
  return [...out];
}

export function isKnownFixture(token, file, fixtures = KNOWN_FIXTURES) {
  const digest = sha256(token);
  return fixtures.some((f) => f.file === file && f.sha256 === digest);
}

/** Enough to locate the hit, never enough to use it: at most 4 leading and 2 trailing chars. */
export function maskToken(tok) {
  const head = tok.slice(0, Math.min(4, Math.floor(tok.length / 4)));
  return `${head}...${tok.slice(-2)} (len ${tok.length})`;
}

/** Returns sweep findings (0-2) for one file. Never includes a full token. */
export function classifyFile(file, body, fixtures = KNOWN_FIXTURES) {
  const hits = findSecretTokens(body);
  if (!hits.length) return [];
  const lineOf = (tok) => body.slice(0, body.indexOf(tok)).split("\n").length;
  const describe = (list) => list.map((h) => `line ${lineOf(h)}: ${maskToken(h)}`).join("; ");
  const known = hits.filter((h) => isKnownFixture(h, file, fixtures));
  const unknown = hits.filter((h) => !known.includes(h));
  const slug = file.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const findings = [];
  if (unknown.length)
    findings.push({
      severity: "P0",
      code: `secret-in-tracked-file-${slug}`,
      summary: `Possible secret committed in ${file} — ${describe(unknown)}`,
      evidence: file,
    });
  if (known.length)
    findings.push({
      severity: "P2",
      code: `secret-placeholder-in-tracked-file-${slug}`,
      summary: `Reviewed test fixture (not a credential) in ${file} — ${describe(known)}`,
      evidence: file,
    });
  return findings;
}
