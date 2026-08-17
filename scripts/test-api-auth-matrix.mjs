#!/usr/bin/env node
/**
 * PP-SEC-001 — API authorization matrix (static + unit).
 * Does NOT hit production. Safe to run in CI / pre-deploy.
 *
 * Usage: node scripts/test-api-auth-matrix.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRIVATE_CACHE_VALUE,
  roleHasPermission,
  PUBLIC_API_ROUTE_PATHS,
  MACHINE_API_PREFIXES,
} from "../lib/api-auth-matrix.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const apiRoot = path.join(root, "app/api");

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "route.ts" || ent.name === "route.js") out.push(p);
  }
  return out;
}

function routePathFromFile(file) {
  return (
    "/" +
    path
      .relative(path.join(root, "app"), file)
      .replace(/\\/g, "/")
      .replace(/\/route\.tsx?$/, "")
  );
}

function isPublicPath(routePath) {
  return PUBLIC_API_ROUTE_PATHS.some(
    (p) => routePath === p || routePath.startsWith(`${p}/`),
  );
}

function isMachinePath(routePath) {
  return MACHINE_API_PREFIXES.some(
    (p) => routePath === p || routePath.startsWith(`${p}/`),
  );
}

const AUTH_RE =
  /requireApiAuth|requireSession|requireOwner|POR_SYNC_SECRET|CRON_SECRET|validateTwilioSignature|SENTINEL_COLLECTOR_SECRET|matterHttpGate|createIntake|completeIntake|intakeStatus|workerLease|workerAck|workerFail|workerHeartbeat|verifyAiCostIngestBearer|requireTimeSession|requireTimeEmployee|requireTimekeepingAdmin|requireMikeOrOwner|verifyTimeMikeBearer/;

check("employee lacks owner-only permissions", () => {
  for (const p of [
    "marketing",
    "bookkeeping",
    "reports",
    "admin",
    "sms_ops",
    "security",
    "ai_cost",
    "timekeeping",
  ]) {
    assert.equal(roleHasPermission("employee", p), false);
  }
});

check("employee has ops permissions", () => {
  for (const p of [
    "session",
    "agents",
    "tasks",
    "emails",
    "social",
    "design",
    "quoting",
    "por",
    "connections",
  ]) {
    assert.equal(roleHasPermission("employee", p), true);
  }
});

check("owner has all listed permissions", () => {
  for (const p of ["admin", "sms_ops", "marketing", "agents", "session"]) {
    assert.equal(roleHasPermission("owner", p), true);
  }
});

check("private cache header constant", () => {
  assert.match(PRIVATE_CACHE_VALUE, /private/);
  assert.match(PRIVATE_CACHE_VALUE, /no-store/);
});

check("every non-public route file has a server auth gate", () => {
  const missing = [];
  for (const file of walk(apiRoot)) {
    const routePath = routePathFromFile(file);
    if (isPublicPath(routePath)) continue;
    const src = fs.readFileSync(file, "utf8");
    if (!AUTH_RE.test(src)) missing.push(routePath);
  }
  assert.deepEqual(missing, [], `ungated routes: ${missing.join(", ")}`);
});

check("Codex-sampled open routes now call requireApiAuth", () => {
  const mustGate = [
    "app/api/connections/route.ts",
    "app/api/catch-up/route.ts",
    "app/api/agents/route.ts",
    "app/api/tasks/route.ts",
    "app/api/design/route.ts",
    "app/api/design/catalog/route.ts",
    "app/api/design/tools/route.ts",
    "app/api/live-check/route.ts",
    "app/api/marketing/route.ts",
    "app/api/social/route.ts",
    "app/api/meta/setup/route.ts",
    "app/api/por/catalog/search/route.ts",
  ];
  for (const rel of mustGate) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(src, /requireApiAuth/, `${rel} missing requireApiAuth`);
  }
});

check("connections sanitize defaults omit sessionToken in source", () => {
  const src = fs.readFileSync(
    path.join(root, "lib/connection-sessions.ts"),
    "utf8",
  );
  assert.match(src, /includeSessionToken/);
  assert.match(src, /never on list/i);
});

check("connections GET never lists all without tokens", () => {
  const src = fs.readFileSync(
    path.join(root, "app/api/connections/route.ts"),
    "utf8",
  );
  assert.match(src, /requireApiAuth\("connections"\)/);
  assert.match(src, /listConnections\(sessionTokens\)/);
  // Owner metadata uses listConnections(undefined) only behind role + ?all=1.
  assert.match(src, /wantAll/);
  assert.match(src, /gate\.role === "owner"/);
});

check("machine prefixes documented", () => {
  assert.ok(MACHINE_API_PREFIXES.includes("/api/por/sync"));
  assert.ok(MACHINE_API_PREFIXES.includes("/api/cron/social"));
  assert.ok(MACHINE_API_PREFIXES.includes("/api/mike/intake"));
  assert.ok(MACHINE_API_PREFIXES.includes("/api/ai-cost/ingest"));
  assert.ok(MACHINE_API_PREFIXES.includes("/api/time/mike"));
});

check("public allowlist includes jobs apply + health + sms inbound", () => {
  for (const p of [
    "/api/jobs/apply",
    "/api/health",
    "/api/sms/inbound",
    "/api/auth/session",
    "/api/time/session",
  ]) {
    assert.ok(PUBLIC_API_ROUTE_PATHS.includes(p), p);
  }
});

// Method coverage inventory: every route exports at least one method and is classified
check("route method inventory non-empty", () => {
  const files = walk(apiRoot);
  assert.ok(files.length >= 50, `expected many routes, got ${files.length}`);
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const methods = [
      ...src.matchAll(
        /export async function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/g,
      ),
    ].map((m) => m[1]);
    assert.ok(
      methods.length > 0,
      `${routePathFromFile(file)} has no HTTP methods`,
    );
  }
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll API auth matrix checks passed.");
