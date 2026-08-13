#!/usr/bin/env node
/**
 * Deployment security regression hook (Cursor-owned).
 * Run before deploy: `npm run test:security`
 * Does not deploy. Fails closed on missing headers / public health PII / ungated sentinel.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const headersSrc = read("lib/security-headers.ts");
for (const need of [
  "Strict-Transport-Security",
  "Content-Security-Policy",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
]) {
  assert.ok(headersSrc.includes(`"${need}"`) || headersSrc.includes(`'${need}'`) || headersSrc.includes(`key: "${need}"`), `SEC-HEADERS regression: missing ${need}`);
}

const nextCfg = read("next.config.ts");
assert.match(nextCfg, /SECURITY_HEADER_ENTRIES/, "next.config missing headers()");
assert.match(nextCfg, /async headers\(/);

const health = read("app/api/health/route.ts");
assert.match(health, /if \(!session\)/);
const publicSlice = health.slice(
  health.indexOf("if (!session)"),
  health.indexOf("authenticatedHealthPayload"),
);
assert.doesNotMatch(publicSlice, /managerPhone|googleAdsAccount|twilioFrom/);

const mw = read("middleware.ts");
assert.match(mw, /corsHeadersForOrigin/);
assert.doesNotMatch(mw, /Access-Control-Allow-Origin["'], ["']\*/);

for (const rel of [
  "app/api/sentinel/health/route.ts",
  "app/api/sentinel/events/route.ts",
  "app/api/sentinel/events/[id]/route.ts",
  "app/api/sentinel/injection-status/route.ts",
  "lib/matter-http.ts",
  "lib/matter-gateway.ts",
]) {
  assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
}

const events = read("app/api/sentinel/events/route.ts");
assert.match(events, /requireApiAuth\("security"\)/);
assert.match(events, /SENTINEL_COLLECTOR_SECRET/);

const gateway = read("lib/matter-http.ts");
assert.match(gateway, /matterHttpGate/);
assert.match(gateway, /SECURITY_AUDIT\.jsonl/);

console.log("ok - security regression hook passed");
