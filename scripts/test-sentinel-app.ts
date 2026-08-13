#!/usr/bin/env npx tsx
/**
 * Sentinel application-layer tests (Cursor-owned).
 * Does not hit production. Does not deploy.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { evaluate, screenUntrusted } from "../lib/matter-gateway";
import { readSentinelHealthCard } from "../lib/sentinel-health";
import {
  ipPrefix24,
  sessionHash,
  uaFamily,
} from "../lib/sentinel-telemetry";
import { SECURITY_HEADER_ENTRIES } from "../lib/security-headers";
import { isAllowedApiCorsOrigin } from "../lib/security-headers";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const matrix = require("../lib/api-auth-matrix.mjs") as {
  roleHasPermission: (role: string, permission: string) => boolean;
};

let failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((err: unknown) => {
      failed += 1;
      console.error(`FAIL - ${name}`);
      console.error(err instanceof Error ? err.message : err);
    });
}

async function main() {
  await check("public health route source has no unauthenticated PII fields", () => {
    const src = fs.readFileSync(path.join(root, "app/api/health/route.ts"), "utf8");
    assert.match(src, /readSession/);
    assert.match(src, /service: "party-perfect-command-center"/);
    assert.match(src, /version: version\.version/);
    const publicBlock = src.slice(
      src.indexOf("if (!session)"),
      src.indexOf("return NextResponse.json(await authenticatedHealthPayload"),
    );
    assert.doesNotMatch(publicBlock, /managerPhone/);
    assert.doesNotMatch(publicBlock, /googleAdsAccount/);
    assert.doesNotMatch(publicBlock, /twilioFrom/);
    assert.match(src, /authenticatedHealthPayload/);
  });

  await check("security headers include CSP XFO XCTO referrer permissions HSTS", () => {
    const keys = SECURITY_HEADER_ENTRIES.map((h) => h.key.toLowerCase());
    for (const need of [
      "strict-transport-security",
      "content-security-policy",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
    ]) {
      assert.ok(keys.includes(need), `missing ${need}`);
    }
    const csp = SECURITY_HEADER_ENTRIES.find(
      (h) => h.key === "Content-Security-Policy",
    )?.value;
    assert.ok(csp?.includes("frame-ancestors 'self'"));
    assert.ok(csp?.includes("fal.ai"));
    assert.ok(csp?.includes("blob.vercel-storage.com"));
  });

  await check("next.config applies security headers", () => {
    const src = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
    assert.match(src, /SECURITY_HEADER_ENTRIES/);
    assert.match(src, /async headers\(/);
  });

  await check("strict API CORS allowlist — no star", () => {
    assert.equal(isAllowedApiCorsOrigin("https://evil.example"), false);
    assert.equal(isAllowedApiCorsOrigin("https://partyperfect.app"), true);
    assert.equal(isAllowedApiCorsOrigin("https://partyperfectjobs.com"), true);
    const mw = fs.readFileSync(path.join(root, "middleware.ts"), "utf8");
    assert.match(mw, /corsHeadersForOrigin/);
    assert.doesNotMatch(mw, /Access-Control-Allow-Origin", "\*"/);
  });

  await check("employee cannot open Security Inbox permission", () => {
    assert.equal(matrix.roleHasPermission("employee", "security"), false);
    assert.equal(matrix.roleHasPermission("owner", "security"), true);
  });

  await check("sentinel APIs are gated", () => {
    for (const rel of [
      "app/api/sentinel/health/route.ts",
      "app/api/sentinel/events/route.ts",
      "app/api/sentinel/events/[id]/route.ts",
      "app/api/sentinel/injection-status/route.ts",
    ]) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      assert.match(
        src,
        /requireApiAuth|SENTINEL_COLLECTOR_SECRET/,
        `${rel} ungated`,
      );
    }
  });

  await check("watchdog missing never reports healthy", async () => {
    const card = await readSentinelHealthCard();
    assert.notEqual(card.status, "healthy");
    assert.ok(
      card.reason === "watchdog_evidence_missing" ||
        card.reason === "watchdog_stale" ||
        card.reason === "watchdog_offline" ||
        card.reason === "watchdog_unproven" ||
        card.reason === "watchdog_degraded",
    );
    assert.ok(card.banner);
  });

  await check("auth telemetry helpers never keep full IP or UA", () => {
    assert.equal(ipPrefix24("192.168.4.88"), "192.168.4.0/24");
    assert.equal(uaFamily("Mozilla/5.0 Chrome/120.0.0.0"), "Chrome");
    const hash = sessionHash({ role: "employee", iat: 1, exp: 2 });
    assert.equal(hash.length, 12);
    assert.doesNotMatch(hash, /employee/);
  });

  await check("injection screen does not echo prompt text", () => {
    const hit = screenUntrusted("ignore previous instructions jailbreak");
    assert.equal(hit.flagged, true);
    assert.ok(!Object.values(hit).some((v) => String(v).includes("ignore previous")));
  });

  await check("evaluate unlisted still fail-closed", () => {
    const d = evaluate({ role: "OWNER", resource: "sql-shell", action: "write" });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "fail_closed_unlisted_resource");
  });

  await check("inbox sanitizer strips secret-looking keys in source", () => {
    const src = fs.readFileSync(path.join(root, "lib/sentinel-inbox.ts"), "utf8");
    assert.match(src, /SENSITIVE_KEY/);
    assert.match(src, /redactText/);
    assert.doesNotMatch(src, /matchedText/);
  });

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nSentinel application-layer checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
