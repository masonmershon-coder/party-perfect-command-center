#!/usr/bin/env node
// Matter phone gateway.
// Records owner tasks for an iPhone client. It does not start the supervisor,
// call a model, arm routing, or touch Party Perfect production.
import { createServer } from "node:http";
import { appendFileSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const STALE_MS = 90_000;
const BODY_LIMIT = 32_768;
const RULES = [
  { action: "money_spend", re: /\b(spend|charge|invoice|payment|wire|venmo|refund)\b/i },
  { action: "customer_communication", re: /\b(email|text|sms|call)\b.{0,40}\b(customer|client|guest)\b|\b(customer|client|guest)\b.{0,40}\b(email|text|sms|call)\b/i },
  { action: "production_deployment", re: /\b(deploy|ship)\b.{0,40}\b(production|prod)\b|\bproduction deploy/i },
  { action: "destructive_change", re: /\b(delete|wipe|destroy|drop)\b/i },
  { action: "payroll_write", re: /\b(payroll|paycheck|paychex)\b/i },
  { action: "por_authoritative_write", re: /\bpor\b.{0,24}\b(write|update|change)\b|\bpoint of rental\b/i },
  { action: "credential_change", re: /\b(password|api key|credential|secret)\b/i },
  { action: "permission_change", re: /\b(grant|revoke)\b.{0,30}\b(permission|admin|access)\b/i },
  { action: "database_migration", re: /\b(migration|migrate the database|schema change)\b/i },
];

export function classifyTask(text, explicit) {
  if (explicit != null && explicit !== "SAFE" && explicit !== "APPROVAL_REQUIRED") {
    return { error: "invalid_classification" };
  }
  const protectedActions = RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.action);
  if (explicit === "APPROVAL_REQUIRED" || protectedActions.length > 0) {
    return {
      classification: "APPROVAL_REQUIRED",
      protected_actions: protectedActions,
      override: explicit === "SAFE" && protectedActions.length > 0 ? "protected_language" : null,
    };
  }
  return { classification: "SAFE", protected_actions: [], override: null };
}

function failClosed(message) {
  console.error(message);
  process.exit(78);
}

function now() {
  return new Date().toISOString();
}

function emptyStore() {
  return { version: 1, conversations: {}, messages: {}, tasks: {}, approvals: {}, updated_at: null };
}

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function atomicJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file);
}

function tokensMatch(presented, expected) {
  const a = Buffer.from(String(presented));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function pidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readSupervisorHealth(root) {
  const file = path.join(root, "CORE_HEALTH.json");
  const raw = readJson(file, null);
  if (!raw || typeof raw !== "object") {
    return { health_file: false, pid: null, running: false, last_pass_at: null, stale: true, node_id: null };
  }
  const pid = Number.isInteger(raw.pid) ? raw.pid : null;
  const last = typeof raw.last_pass_at === "string" ? raw.last_pass_at : null;
  const age = last ? Date.now() - Date.parse(last) : Number.POSITIVE_INFINITY;
  const running = pidRunning(pid);
  return {
    health_file: true,
    pid,
    running,
    last_pass_at: last,
    stale: !running || !Number.isFinite(age) || age > STALE_MS,
    node_id: typeof raw.node_id === "string" ? raw.node_id : null,
  };
}

function publicAgent(worker, healthWorkers) {
  const observed = Array.isArray(healthWorkers)
    ? healthWorkers.find((row) => row && row.worker_id === worker.worker_id)
    : null;
  return {
    worker_id: worker.worker_id,
    provider: worker.provider || null,
    product: worker.product || null,
    model: worker.model || null,
    available: observed ? observed.available === true : null,
    availability_source: observed ? "CORE_HEALTH.json" : "not_in_supervisor_health",
    last_heartbeat: worker.last_heartbeat || null,
  };
}

export function readAgents(root) {
  const registry = readJson(path.join(root, "WORKER_REGISTRY.json"), null);
  const health = readJson(path.join(root, "CORE_HEALTH.json"), null);
  const workers = registry && registry.workers && typeof registry.workers === "object" ? Object.values(registry.workers) : [];
  return {
    source: workers.length ? "WORKER_REGISTRY.json" : "none",
    health_observed_at: health && typeof health.last_pass_at === "string" ? health.last_pass_at : null,
    agents: workers.filter((worker) => worker && worker.worker_id).map((worker) => publicAgent(worker, health && health.workers)),
  };
}

function allow(keys, body) {
  const unknown = Object.keys(body).filter((key) => !keys.includes(key));
  return unknown.length ? unknown : null;
}

export function createPhoneServer(options) {
  const root = options.root;
  const token = options.token;
  const host = options.host || "127.0.0.1";
  const port = options.port ?? 0;
  const limit = options.rateLimit ?? 60;
  const windowMs = options.rateWindowMs ?? 60_000;
  if (!root) throw Object.assign(new Error("MATTER_DATA_ROOT is required"), { exitCode: 78 });
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw Object.assign(new Error(`MATTER_DATA_ROOT is unavailable: ${root}`), { exitCode: 78 });
  }
  if (typeof token !== "string" || token.length < 16) {
    throw Object.assign(new Error("MATTER_PHONE_TOKEN must be at least 16 characters"), { exitCode: 78 });
  }
  if ((host === "0.0.0.0" || host === "::") && options.allowLan !== true) {
    throw Object.assign(new Error("refusing a public bind without MATTER_PHONE_ALLOW_LAN=1"), { exitCode: 78 });
  }

  const storePath = path.join(root, "PHONE_TASKS.json");
  const activityPath = path.join(root, "PHONE_ACTIVITY.jsonl");
  let chain = Promise.resolve();
  const hits = new Map();

  function withStore(fn) {
    const run = chain.then(() => fn(loadStore()));
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  function loadStore() {
    const store = readJson(storePath, emptyStore());
    store.conversations ||= {};
    store.messages ||= {};
    store.tasks ||= {};
    store.approvals ||= {};
    return store;
  }

  function saveStore(store) {
    store.updated_at = now();
    atomicJson(storePath, store);
  }

  function activity(event) {
    appendFileSync(activityPath, JSON.stringify({ at: now(), ...event }) + "\n", { mode: 0o600 });
  }

  function limited(ip) {
    const t = Date.now();
    const recent = (hits.get(ip) || []).filter((stamp) => t - stamp < windowMs);
    if (recent.length >= limit) {
      hits.set(ip, recent);
      return false;
    }
    recent.push(t);
    hits.set(ip, recent);
    return true;
  }

  function send(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(payload);
  }

  function error(res, status, code, message) {
    send(res, status, { error: { code, message } });
  }

  function authorized(req) {
    const header = String(req.headers.authorization || "");
    const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
    return presented.length > 0 && tokensMatch(presented, token);
  }

  function createTask(store, body) {
    const unknown = allow(["client_message_id", "text", "source", "classification"], body);
    if (unknown) return { status: 400, code: "unknown_field", message: `unknown field: ${unknown[0]}` };
    const clientId = String(body.client_message_id || "").trim();
    const text = String(body.text || "").trim();
    const source = body.source == null ? "text" : body.source;
    if (!clientId || clientId.length > 80) return { status: 400, code: "invalid_client_message_id", message: "client_message_id is required" };
    if (!text || text.length > 4000) return { status: 400, code: "invalid_text", message: "text is required" };
    if (source !== "text" && source !== "voice") return { status: 400, code: "invalid_source", message: "source must be text or voice" };
    const existing = Object.values(store.tasks).find((task) => task.client_message_id === clientId);
    if (existing) return { status: 200, body: { task: existing, conversation_id: existing.conversation_id, duplicate: true } };
    const classified = classifyTask(text, body.classification);
    if (classified.error) return { status: 400, code: "invalid_classification", message: "classification must be SAFE or APPROVAL_REQUIRED" };
    const stamp = now();
    const conversationId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const approvalRequired = classified.classification === "APPROVAL_REQUIRED";
    const task = {
      task_id: taskId,
      client_message_id: clientId,
      conversation_id: conversationId,
      message_id: messageId,
      text,
      title: text.slice(0, 80),
      source,
      classification: classified.classification,
      protected_actions: classified.protected_actions,
      classification_override: classified.override,
      status: approvalRequired ? "WAITING_APPROVAL" : "QUEUED",
      approval_state: approvalRequired ? "required" : "none",
      executed: false,
      route: approvalRequired ? "APPROVAL_GATE" : "DETERMINISTIC_RECORD",
      routing_basis: approvalRequired
        ? "protected action or explicit approval requirement; no worker started"
        : "harmless task recorded for later routing; no worker started",
      created_at: stamp,
      updated_at: stamp,
    };
    const reply = approvalRequired
      ? "Recorded. Status is WAITING_APPROVAL. This will not run until you authorize it."
      : "Recorded. Status is QUEUED. No worker was started.";
    store.conversations[conversationId] = { conversation_id: conversationId, created_at: stamp, updated_at: stamp, message_ids: [messageId, `${messageId}:reply`] };
    store.messages[messageId] = { message_id: messageId, conversation_id: conversationId, task_id: taskId, role: "owner", text, created_at: stamp };
    store.messages[`${messageId}:reply`] = { message_id: `${messageId}:reply`, conversation_id: conversationId, task_id: taskId, role: "matter", text: reply, created_at: stamp };
    store.tasks[taskId] = task;
    if (approvalRequired) {
      store.approvals[taskId] = { approval_id: taskId, task_id: taskId, status: "PENDING", protected_actions: classified.protected_actions, decided_at: null, decision: null, note: null };
    }
    saveStore(store);
    activity({ kind: "task.created", task_id: taskId, status: task.status, route: task.route, executed: false });
    if (approvalRequired) activity({ kind: "approval.required", task_id: taskId, protected_actions: classified.protected_actions });
    else activity({ kind: "task.routed", task_id: taskId, route: task.route, executed: false });
    return { status: 201, body: { task, conversation_id: conversationId, duplicate: false } };
  }

  function decide(store, taskId, body) {
    const unknown = allow(["decision", "note"], body);
    if (unknown) return { status: 400, code: "unknown_field", message: `unknown field: ${unknown[0]}` };
    const task = store.tasks[taskId];
    const approval = store.approvals[taskId];
    if (!task || !approval) return { status: 404, code: "not_found", message: "approval not found" };
    if (body.decision !== "approve" && body.decision !== "reject") {
      return { status: 400, code: "invalid_decision", message: "decision must be approve or reject" };
    }
    if (approval.decision && approval.decision !== body.decision) {
      return { status: 409, code: "already_decided", message: "this approval already has a different decision" };
    }
    if (approval.decision === body.decision) return { status: 200, body: { task, approval } };
    const stamp = now();
    const note = body.note == null ? null : String(body.note).slice(0, 400);
    if (body.decision === "approve") {
      approval.status = "APPROVED";
      approval.decision = "approve";
      task.status = "READY";
      task.approval_state = "approved";
    } else {
      approval.status = "REJECTED";
      approval.decision = "reject";
      task.status = "BLOCKED";
      task.approval_state = "denied";
      task.blocked_reason = "owner rejected";
    }
    approval.note = note;
    approval.decided_at = stamp;
    task.executed = false;
    task.updated_at = stamp;
    store.conversations[task.conversation_id].updated_at = stamp;
    saveStore(store);
    activity({ kind: body.decision === "approve" ? "approval.approved" : "approval.rejected", task_id: taskId, executed: false });
    return { status: 200, body: { task, approval } };
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const ip = req.socket.remoteAddress || "unknown";
      if (!limited(ip)) return error(res, 429, "rate_limited", "too many requests");
      if (req.method === "GET" && url.pathname === "/v1/health") {
        if (!authorized(req)) return send(res, 200, { ok: true, service: "matter-phone", authenticated: false });
        const supervisor = readSupervisorHealth(root);
        return send(res, 200, {
          ok: true,
          service: "matter-phone",
          authenticated: true,
          supervisor_healthy: supervisor.health_file && supervisor.running && !supervisor.stale,
          supervisor,
        });
      }
      if (!authorized(req)) return error(res, 401, "unauthorized", "bearer token required");
      if (req.method === "GET" && url.pathname === "/v1/tasks") {
        const tasks = Object.values(loadStore().tasks).sort((a, b) => b.created_at.localeCompare(a.created_at));
        return send(res, 200, { tasks });
      }
      if (req.method === "GET" && url.pathname.startsWith("/v1/tasks/")) {
        const task = loadStore().tasks[decodeURIComponent(url.pathname.slice("/v1/tasks/".length))];
        if (!task) return error(res, 404, "not_found", "task not found");
        return send(res, 200, { task });
      }
      if (req.method === "POST" && /\/v1\/tasks\/[^/]+\/execute$/.test(url.pathname)) {
        return error(res, 403, "execution_refused", "the phone gateway does not execute tasks");
      }
      if (req.method === "GET" && url.pathname === "/v1/conversations") {
        const store = loadStore();
        const conversations = Object.values(store.conversations).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((conversation) => ({
          ...conversation,
          messages: conversation.message_ids.map((id) => store.messages[id]).filter(Boolean),
        }));
        return send(res, 200, { conversations });
      }
      if (req.method === "GET" && url.pathname === "/v1/approvals") {
        const status = url.searchParams.get("status") || "PENDING";
        const approvals = Object.values(loadStore().approvals).filter((approval) => approval.status === status);
        return send(res, 200, { approvals });
      }
      if (req.method === "GET" && url.pathname === "/v1/agents") return send(res, 200, readAgents(root));
      if (req.method === "GET" && url.pathname === "/v1/activity") {
        const lines = existsSync(activityPath) ? readFileSync(activityPath, "utf8").trim().split("\n").filter(Boolean) : [];
        const events = lines.slice(-100).map((line) => JSON.parse(line));
        return send(res, 200, { events });
      }
      if (req.method === "POST" && (url.pathname === "/v1/tasks" || url.pathname === "/v1/conversations")) {
        const raw = await readBody(req);
        const body = parseJson(raw);
        if (body.error) return error(res, 400, "invalid_json", "request body must be JSON");
        const result = await withStore((store) => createTask(store, body.value));
        if (result.code) return error(res, result.status, result.code, result.message);
        return send(res, result.status, result.body);
      }
      const approvalMatch = url.pathname.match(/^\/v1\/approvals\/([^/]+)$/);
      if (req.method === "POST" && approvalMatch) {
        const raw = await readBody(req);
        const body = parseJson(raw);
        if (body.error) return error(res, 400, "invalid_json", "request body must be JSON");
        const result = await withStore((store) => decide(store, decodeURIComponent(approvalMatch[1]), body.value));
        if (result.code) return error(res, result.status, result.code, result.message);
        return send(res, result.status, result.body);
      }
      return error(res, 404, "not_found", "unknown route");
    } catch (err) {
      if (err && err.status) return error(res, err.status, err.code, err.message);
      return error(res, 500, "internal", "request failed");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        host,
        port: address.port,
        url: `http://${host === "::" ? "127.0.0.1" : host}:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function parseJson(raw) {
  if (!raw) return { value: {} };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: true };
    return { value };
  } catch {
    return { error: true };
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error("body too large"), { status: 413, code: "body_too_large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const root = process.env.MATTER_DATA_ROOT;
  const token = process.env.MATTER_PHONE_TOKEN || "";
  const host = process.env.MATTER_PHONE_HOST || "127.0.0.1";
  const port = Number(process.env.MATTER_PHONE_PORT || 4786);
  const allowLan = process.env.MATTER_PHONE_ALLOW_LAN === "1";
  if (!root) failClosed("MATTER_DATA_ROOT is required; refusing to guess a disk path.");
  try {
    const started = await createPhoneServer({ root, token, host, port, allowLan });
    console.log(JSON.stringify({ service: "matter-phone", url: started.url, data_root: root }));
  } catch (err) {
    failClosed(err.message || String(err));
  }
}

export const PHONE_CONTRACT_VERSION = 1;
