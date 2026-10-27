#!/usr/bin/env node
// Integration tests for the Matter phone gateway. Hermetic. No model calls.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPhoneServer } from "./phone-api.mjs";

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
await expectClosed(() => createPhoneServer({ root, token: TOKEN, host: "0.0.0.0" }));
assert.equal(existsSync(missing), false, "unavailable data root must not be created");

const cli = spawnSync(process.execPath, [path.join(HERE, "phone-api.mjs")], {
  env: { ...process.env, MATTER_DATA_ROOT: "", MATTER_PHONE_TOKEN: TOKEN },
});
assert.equal(cli.status, 78, "missing data root must fail closed");

writeFileSync(path.join(root, "WORKER_REGISTRY.json"), JSON.stringify({
  workers: {
    "codex-local": { worker_id: "codex-local", provider: "openai", product: "codex", model: "test", last_heartbeat: null },
    "cursor-local": { worker_id: "cursor-local", provider: "cursor", product: "cursor", last_heartbeat: "2026-10-01T00:00:00.000Z" },
  },
}));
writeFileSync(path.join(root, "CORE_HEALTH.json"), JSON.stringify({
  pid: 999999,
  last_pass_at: "2020-01-01T00:00:00.000Z",
  node_id: "fixture",
  workers: [{ worker_id: "codex-local", available: false }],
}));

const api = await createPhoneServer({ root, token: TOKEN, host: "127.0.0.1", port: 0 });

async function call(pathname, { method = "GET", body, token = TOKEN } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers["content-type"] = "application/json";
  const response = await fetch(`${api.url}${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json();
  return { status: response.status, json };
}

const openHealth = await call("/v1/health", { token: "" });
assert.equal(openHealth.status, 200);
assert.equal(openHealth.json.authenticated, false);
assert.equal(openHealth.json.supervisor, undefined, "unauthenticated health must not reveal supervisor state");

const denied = await call("/v1/tasks", { token: "" });
assert.equal(denied.status, 401);
assert.equal(denied.json.error.code, "unauthorized");
const wrong = await call("/v1/tasks", { token: "not-the-real-token" });
assert.equal(wrong.status, 401);

const health = await call("/v1/health");
assert.equal(health.json.service, "matter-phone");
assert.equal(health.json.supervisor_healthy, false, "a dead stale pid is not a healthy supervisor");
assert.equal(health.json.supervisor.pid, 999999);
assert.equal(health.json.supervisor.running, false);

const created = await call("/v1/tasks", {
  method: "POST",
  body: { client_message_id: "msg-safe-1", text: "Remind me to review the Matter notes tomorrow", source: "text" },
});
assert.equal(created.status, 201);
assert.equal(created.json.task.status, "QUEUED");
assert.equal(created.json.task.executed, false);
assert.equal(created.json.task.route, "DETERMINISTIC_RECORD");
assert.equal(created.json.task.classification, "SAFE");

const again = await call("/v1/conversations", {
  method: "POST",
  body: { client_message_id: "msg-safe-1", text: "Remind me to review the Matter notes tomorrow" },
});
assert.equal(again.status, 200);
assert.equal(again.json.duplicate, true);
assert.equal(again.json.task.task_id, created.json.task.task_id);

const listed = await call("/v1/tasks");
assert.equal(listed.json.tasks.length, 1);
const fetched = await call(`/v1/tasks/${created.json.task.task_id}`);
assert.equal(fetched.json.task.status, "QUEUED");

const blockedRun = await call(`/v1/tasks/${created.json.task.task_id}/execute`, { method: "POST", body: {} });
assert.equal(blockedRun.status, 403);
assert.equal(blockedRun.json.error.code, "execution_refused");

const approval = await call("/v1/tasks", {
  method: "POST",
  body: { client_message_id: "msg-approval-1", text: "Email the customer that the tent is ready", classification: "SAFE" },
});
assert.equal(approval.status, 201);
assert.equal(approval.json.task.status, "WAITING_APPROVAL");
assert.equal(approval.json.task.executed, false);
assert.equal(approval.json.task.classification_override, "protected_language");
assert.ok(approval.json.task.protected_actions.includes("customer_communication"));

const pending = await call("/v1/approvals?status=PENDING");
assert.equal(pending.json.approvals.length, 1);
assert.equal(pending.json.approvals[0].task_id, approval.json.task.task_id);

const approved = await call(`/v1/approvals/${approval.json.task.task_id}`, {
  method: "POST",
  body: { decision: "approve", note: "owner authorized the record only" },
});
assert.equal(approved.status, 200);
assert.equal(approved.json.task.status, "READY");
assert.equal(approved.json.task.approval_state, "approved");
assert.equal(approved.json.task.executed, false, "approval must not start execution");
assert.equal(approved.json.approval.status, "APPROVED");

const rejected = await call("/v1/tasks", {
  method: "POST",
  body: { client_message_id: "msg-approval-2", text: "Delete the production database", classification: "APPROVAL_REQUIRED" },
});
const denial = await call(`/v1/approvals/${rejected.json.task.task_id}`, { method: "POST", body: { decision: "reject" } });
assert.equal(denial.json.task.status, "BLOCKED");
assert.equal(denial.json.task.approval_state, "denied");
assert.equal(denial.json.approval.status, "REJECTED");
const conflict = await call(`/v1/approvals/${rejected.json.task.task_id}`, { method: "POST", body: { decision: "approve" } });
assert.equal(conflict.status, 409);

const agents = await call("/v1/agents");
assert.equal(agents.json.source, "WORKER_REGISTRY.json");
const codex = agents.json.agents.find((agent) => agent.worker_id === "codex-local");
const cursor = agents.json.agents.find((agent) => agent.worker_id === "cursor-local");
assert.equal(codex.available, false, "health false must stay false");
assert.equal(cursor.available, null, "a registry row without a health observation is not available");
assert.equal(codex.detect, undefined, "probe commands stay off the phone payload");

const activity = await call("/v1/activity");
assert.ok(activity.json.events.some((event) => event.kind === "task.routed" && event.executed === false));
assert.ok(activity.json.events.some((event) => event.kind === "approval.approved"));
assert.ok(activity.json.events.some((event) => event.kind === "approval.rejected"));

const unknown = await call("/v1/tasks", { method: "POST", body: { client_message_id: "x", text: "hello", model: "gpt" } });
assert.equal(unknown.status, 400);
assert.equal(unknown.json.error.code, "unknown_field");

const beforeRestart = JSON.parse(readFileSync(path.join(root, "PHONE_TASKS.json"), "utf8"));
await api.close();
const restarted = await createPhoneServer({ root, token: TOKEN, host: "127.0.0.1", port: 0 });
const after = await fetch(`${restarted.url}/v1/tasks`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((res) => res.json());
assert.equal(after.tasks.length, beforeRestart && Object.keys(beforeRestart.tasks).length);
assert.ok(after.tasks.some((task) => task.client_message_id === "msg-safe-1" && task.status === "QUEUED"));

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
assert.equal(supervisorPid, child.pid, "fixture supervisor must report its own pid");
const live = await fetch(`${restarted.url}/v1/health`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((res) => res.json());
assert.equal(live.supervisor.running, true);
assert.equal(live.supervisor.pid, child.pid);
child.kill("SIGTERM");
await new Promise((resolve) => child.once("exit", resolve));
const persisted = JSON.parse(readFileSync(path.join(root, "PHONE_TASKS.json"), "utf8"));
assert.equal(persisted.tasks[created.json.task.task_id].status, "QUEUED");
assert.equal(persisted.tasks[approval.json.task.task_id].executed, false);
const afterSupervisor = await fetch(`${restarted.url}/v1/health`, { headers: { authorization: `Bearer ${TOKEN}` } }).then((res) => res.json());
assert.equal(afterSupervisor.supervisor.running, false);
assert.equal(afterSupervisor.supervisor_healthy, false);

const tight = await createPhoneServer({ root, token: TOKEN, host: "127.0.0.1", port: 0, rateLimit: 2, rateWindowMs: 60_000 });
const first = await fetch(`${tight.url}/v1/health`);
const second = await fetch(`${tight.url}/v1/health`);
const third = await fetch(`${tight.url}/v1/health`);
assert.equal(first.status, 200);
assert.equal(second.status, 200);
assert.equal(third.status, 429);
await tight.close();
await restarted.close();

console.log(JSON.stringify({ pass: true, root, tasks: Object.keys(persisted.tasks).length }, null, 2));
