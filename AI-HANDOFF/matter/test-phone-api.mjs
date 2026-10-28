#!/usr/bin/env node
// Contract tests for the Matter phone gateway. Hermetic. No model calls.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { createPhoneServer, PHONE_CONTRACT_VERSION } from "./phone-api.mjs";

assert.equal(PHONE_CONTRACT_VERSION, 3);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = "test-phone-token-16";
const root = mkdtempSync(path.join(tmpdir(), "matter-phone-"));
const missing = path.join(root, "missing-root");

async function expectClosed(fn) {
  try {
    await fn();
    throw new Error("expected fail closed");
  } catch (err) {
    assert.equal(err.exitCode, 78);
  }
}
await expectClosed(() => createPhoneServer({ root: missing, token: TOKEN }));
await expectClosed(() => createPhoneServer({ root, token: "short" }));
await expectClosed(() => createPhoneServer({ root, token: TOKEN, host: "0.0.0.0", allowLan: true, tlsCert: "/tmp/x", tlsKey: "/tmp/y" }));
await expectClosed(() => createPhoneServer({ root, token: TOKEN, host: "203.0.113.10", allowLan: true, tlsCert: "/tmp/x", tlsKey: "/tmp/y" }));
await expectClosed(() => createPhoneServer({ root, token: TOKEN, host: "192.168.1.20", allowLan: true }));
assert.equal(existsSync(missing), false, "unavailable data root must not be created");

const cli = spawnSync(process.execPath, [path.join(HERE, "phone-api.mjs")], {
  env: { ...process.env, MATTER_DATA_ROOT: "", MATTER_PHONE_TOKEN: TOKEN },
});
assert.equal(cli.status, 78, "missing data root must fail closed");

writeFileSync(path.join(root, "WORKER_REGISTRY.json"), JSON.stringify({
  workers: {
    "codex-local": { worker_id: "codex-local", provider: "openai", product: "codex", model: "test", last_heartbeat: null, detect: ["codex", "--version"] },
    "cursor-local": { worker_id: "cursor-local", provider: "cursor", product: "cursor", last_heartbeat: "2026-10-01T00:00:00.000Z" },
    "ollama-local": { worker_id: "ollama-local", provider: "ollama", product: "ollama", model: "local", detect: ["http://127.0.0.1:11434/api/tags"], last_heartbeat: null },
  },
}));
writeFileSync(path.join(root, "CORE_HEALTH.json"), JSON.stringify({
  pid: 999999,
  last_pass_at: "2020-01-01T00:00:00.000Z",
  node_id: "fixture",
  workers: [{ worker_id: "codex-local", available: false }],
}));

const api = await createPhoneServer({ root, token: TOKEN, host: "127.0.0.1", port: 0 });

async function call(pathname, { method = "GET", body, token = TOKEN, base = api.url } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json();
  return { status: response.status, json };
}

const openHealth = await call("/v1/health", { token: "" });
assert.equal(openHealth.status, 200);
assert.equal(openHealth.json.authenticated, false);
assert.equal(openHealth.json.supervisor, undefined);

assert.equal((await call("/v1/tasks", { token: "" })).status, 401);
assert.equal((await call("/v1/tasks", { token: "not-the-real-token" })).json.error.code, "unauthorized");

const health = await call("/v1/health");
assert.equal(health.json.supervisor_healthy, false);
assert.equal(health.json.supervisor.pid, 999999);
assert.equal(health.json.supervisor.running, false);

const refused = await call("/v1/tasks", {
  method: "POST",
  body: { client_message_id: "msg-safe-1", text: "Email the customer that the tent is ready", source: "text" },
});
assert.equal(refused.status, 503);
assert.equal(refused.json.error.code, "intake_required");
assert.equal(existsSync(path.join(root, "LEASES.json")), false, "gateway must not invent a task without intake");
assert.equal(existsSync(path.join(root, "PHONE_TASKS.json")), false);
const refusedDecision = await call("/v1/approvals/not-a-task", { method: "POST", body: { decision: "reject" } });
assert.equal(refusedDecision.status, 503);
assert.equal(refusedDecision.json.error.code, "approval_journal_required");
const claimed = await call("/v1/tasks", {
  method: "POST",
  body: { client_message_id: "msg-claimed-safe", text: "Email the customer that the tent is ready", classification: "SAFE" },
});
assert.equal(claimed.status, 400);
assert.equal(claimed.json.error.code, "unknown_field");

const intakeHits = [];
const intake = createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    intakeHits.push(body);
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ accepted: true, status: "RECORDED_BY_INTAKE", client_message_id: body.client_message_id }));
  });
});
await new Promise((resolve) => intake.listen(0, "127.0.0.1", resolve));
const intakePort = intake.address().port;
const forwarding = await createPhoneServer({
  root, token: TOKEN, host: "127.0.0.1", port: 0, intakeUrl: `http://127.0.0.1:${intakePort}/intake`,
});
const forwarded = await call("/v1/tasks", {
  method: "POST",
  base: forwarding.url,
  body: { client_message_id: "msg-safe-1", text: "Remind me to review the Matter notes tomorrow", source: "text" },
});
assert.equal(forwarded.status, 201);
assert.equal(forwarded.json.status, "RECORDED_BY_INTAKE");
assert.equal(intakeHits.length, 1);
assert.equal(intakeHits[0].classification, undefined);
assert.equal(intakeHits[0].text, "Remind me to review the Matter notes tomorrow");
assert.equal(existsSync(path.join(root, "LEASES.json")), false, "forwarding must not write a second ledger");
await forwarding.close();
await new Promise((resolve) => intake.close(resolve));
const closed = await createPhoneServer({
  root, token: TOKEN, host: "127.0.0.1", port: 0, intakeUrl: "http://127.0.0.1:1/intake",
});
const unreachable = await call("/v1/tasks", {
  method: "POST",
  base: closed.url,
  body: { client_message_id: "msg-down", text: "Remind me to review the Matter notes tomorrow", source: "text" },
});
assert.equal(unreachable.status, 502);
assert.equal(unreachable.json.error.code, "upstream_unreachable");
assert.equal(existsSync(path.join(root, "LEASES.json")), false);
await closed.close();
await expectClosed(() => createPhoneServer({ root, token: TOKEN, intakeUrl: "http://203.0.113.10/intake" }));

const execution = await import("./execution.mjs");
execution.enqueue("ledger-safe", { requirements: { origin: "matter-phone", client_message_id: "ledger-safe", text: "seeded by the ledger test", source: "text" } });
execution.enqueue("ledger-held", { requirements: { origin: "matter-phone", client_message_id: "ledger-held", text: "seeded held task", source: "text" } });
execution.block("ledger-held", "WAITING_APPROVAL", "held by the authoritative ledger");
assert.throws(() => execution.lease("ledger-held", "phone-client"), /WAITING_APPROVAL/);
assert.equal((await call("/v1/tasks/ledger-safe/execute", { method: "POST", body: {} })).status, 403);

const agents = await call("/v1/agents");
assert.equal(agents.json.agents.find((agent) => agent.worker_id === "codex-local").available, false);
assert.equal(agents.json.agents.find((agent) => agent.worker_id === "cursor-local").available, null);
assert.equal(agents.json.agents.find((agent) => agent.worker_id === "ollama-local").detect, undefined);
const mission = await call("/v1/mission");
assert.equal(mission.json.local_intelligence.observed, true);
assert.equal(mission.json.local_intelligence.available, null);
assert.equal(JSON.stringify(mission.json).includes("11434"), false, "local intelligence endpoint must not be returned");
assert.equal(mission.json.queue.by_state.WAITING_APPROVAL, 1);
assert.equal(mission.json.queue.by_state.QUEUED, 1);
assert.equal(mission.json.supervisor_healthy, false);

const activity = await call("/v1/activity");
assert.ok(activity.json.events.some((event) => event.kind === "WAITING_APPROVAL"));
assert.equal(activity.json.events.some((event) => event.kind === "RELEASED"), false);

const beforeRestart = JSON.parse(readFileSync(path.join(root, "LEASES.json"), "utf8"));
await api.close();
const restarted = await createPhoneServer({ root, token: TOKEN, host: "127.0.0.1", port: 0 });
const after = await fetch(`${restarted.url}/v1/tasks`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((res) => res.json());
assert.equal(after.tasks.length, Object.values(beforeRestart.tasks).filter((task) => task.requirements && task.requirements.origin === "matter-phone").length);

writeFileSync(path.join(root, "WORKER_REGISTRY.json"), JSON.stringify({
  workers: {
    "codex-local": { worker_id: "codex-local", provider: "openai", product: "codex", detect: ["false"] },
    "cursor-local": { worker_id: "cursor-local", provider: "cursor", product: "cursor", detect: ["false"] },
    "ollama-local": { worker_id: "ollama-local", provider: "ollama", product: "ollama", detect: ["false"] },
  },
}));
const child = spawn(process.execPath, [path.join(HERE, "core-alpha.mjs")], {
  env: { ...process.env, MATTER_DATA_ROOT: root, MATTER_DIR: root, MATTER_EXEC_DIR: root, MATTER_CORE_INTERVAL_SEC: "15" },
  stdio: "ignore",
});
const healthFile = path.join(root, "CORE_HEALTH.json");
const deadline = Date.now() + 5000;
let supervisorPid = null;
while (Date.now() < deadline) {
  if (existsSync(healthFile)) {
    const snap = JSON.parse(readFileSync(healthFile, "utf8"));
    if (snap.pid === child.pid) { supervisorPid = snap.pid; break; }
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
}
assert.equal(supervisorPid, child.pid);
const live = await fetch(`${restarted.url}/v1/health`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((res) => res.json());
assert.equal(live.supervisor.running, true);
assert.equal(live.supervisor.pid, child.pid);
child.kill("SIGTERM");
await new Promise((resolve) => child.once("exit", resolve));
const persisted = JSON.parse(readFileSync(path.join(root, "LEASES.json"), "utf8"));
assert.equal(persisted.tasks["ledger-safe"].state, "QUEUED");
assert.equal(persisted.tasks["ledger-held"].state, "WAITING_APPROVAL");
assert.equal(persisted.tasks["ledger-held"].lease, null);
const afterSupervisor = await fetch(`${restarted.url}/v1/mission`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((res) => res.json());
assert.equal(afterSupervisor.supervisor.running, false);
assert.equal(afterSupervisor.supervisor_healthy, false);

const expired = await createPhoneServer({
  root, token: TOKEN, host: "127.0.0.1", port: 0, tokenNotAfter: "2020-01-01T00:00:00.000Z",
});
const expiredCall = await fetch(`${expired.url}/v1/tasks`, { headers: { authorization: `Bearer ${TOKEN}` } }).then(async (res) => ({ status: res.status, json: await res.json() }));
assert.equal(expiredCall.status, 401);
assert.equal(expiredCall.json.error.code, "session_expired");
await expired.close();

const tlsDir = mkdtempSync(path.join(tmpdir(), "matter-phone-tls-"));
const cert = path.join(tlsDir, "cert.pem");
const key = path.join(tlsDir, "key.pem");
const minted = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert, "-days", "1", "-nodes", "-subj", "/CN=matter-phone-test"], { encoding: "utf8" });
assert.equal(minted.status, 0, minted.stderr);
const secure = await createPhoneServer({ root, token: TOKEN, host: "127.0.0.1", port: 0, tlsCert: cert, tlsKey: key });
assert.ok(secure.url.startsWith("https://"));
const tlsHealth = await new Promise((resolve, reject) => {
  const req = https.request(`${secure.url}/v1/health`, { headers: { authorization: `Bearer ${TOKEN}` }, rejectUnauthorized: false }, (res) => {
    res.resume();
    res.on("end", () => resolve(res.statusCode));
  });
  req.on("error", reject);
  req.end();
});
assert.equal(tlsHealth, 200);
await secure.close();

const tight = await createPhoneServer({ root, token: TOKEN, host: "127.0.0.1", port: 0, rateLimit: 2, rateWindowMs: 60_000 });
assert.equal((await fetch(`${tight.url}/v1/health`)).status, 200);
assert.equal((await fetch(`${tight.url}/v1/health`)).status, 200);
assert.equal((await fetch(`${tight.url}/v1/health`)).status, 429);
await tight.close();
await restarted.close();

console.log(JSON.stringify({ pass: true, root, tasks: Object.keys(persisted.tasks).length, ledger: "LEASES.json" }, null, 2));
