#!/usr/bin/env node
// Matter phone gateway.
// Reads and writes the Core execution ledger (LEASES.json). It does not keep a
// second task database, start the supervisor, call a model, or execute work.
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { existsSync, readFileSync, statSync } from "node:fs";
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
const LOCAL_INTELLIGENCE = /ollama|lmstudio|lm-studio|local-llm|local_llm/i;

export function classifyTask(text) {
  const protectedActions = RULES.filter((rule) => rule.re.test(String(text || ""))).map((rule) => rule.action);
  if (protectedActions.length > 0) return { classification: "APPROVAL_REQUIRED", protected_actions: protectedActions };
  return { classification: "SAFE", protected_actions: [] };
}

function failClosed(message) {
  console.error(message);
  process.exit(78);
}

function now() {
  return new Date().toISOString();
}

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
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

function isLoopback(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function isPrivateHost(host) {
  if (isLoopback(host)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  if (/^fd[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  return false;
}

export function readSupervisorHealth(root) {
  const raw = readJson(path.join(root, "CORE_HEALTH.json"), null);
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

export function readLocalIntelligence(root) {
  const match = readAgents(root).agents.filter((agent) => LOCAL_INTELLIGENCE.test(`${agent.worker_id} ${agent.product || ""} ${agent.provider || ""}`));
  if (!match.length) {
    return { observed: false, available: null, workers: [], reason: "no local intelligence worker in the registry snapshot" };
  }
  const available = match.some((agent) => agent.available === true) ? true : match.every((agent) => agent.available === false) ? false : null;
  return {
    observed: true,
    available,
    workers: match.map((agent) => agent.worker_id),
    reason: available === null ? "not in supervisor health" : "supervisor health",
  };
}

let executionPromise = null;
function loadExecution(root) {
  process.env.MATTER_DATA_ROOT = root;
  process.env.MATTER_EXEC_DIR = root;
  if (!executionPromise) executionPromise = import("./execution.mjs");
  return executionPromise;
}

function leases(root) {
  return readJson(path.join(root, "LEASES.json"), { tasks: {} });
}

function present(task) {
  const req = task.requirements || {};
  const executed = task.state === "RUNNING" || task.state === "SUCCEEDED" || task.state === "LEASED";
  return {
    task_id: task.task_id,
    client_message_id: req.client_message_id || null,
    conversation_id: task.task_id,
    text: req.text || "",
    title: String(req.text || task.task_id).slice(0, 80),
    status: task.state,
    classification: req.classification || null,
    approval_state: req.approval_state || "none",
    executed,
    route: req.route || null,
    routing_basis: req.routing_basis || null,
    protected_actions: req.protected_actions || [],
    created_at: task.created_at,
  };
}

function messagesFor(task) {
  const req = task.requirements || {};
  return (req.messages || []).map((message) => ({
    message_id: message.message_id,
    conversation_id: task.task_id,
    task_id: task.task_id,
    role: message.role,
    text: message.text,
    created_at: message.created_at,
  }));
}

function approvalStatus(task) {
  const decision = task.requirements && task.requirements.approval_decision;
  if (task.state === "WAITING_APPROVAL") return "PENDING";
  if (decision === "approve") return "APPROVED";
  if (decision === "reject") return "REJECTED";
  return null;
}

function presentApproval(task) {
  const status = approvalStatus(task);
  if (!status) return null;
  const req = task.requirements || {};
  return {
    approval_id: task.task_id,
    task_id: task.task_id,
    status,
    protected_actions: req.protected_actions || [],
    decision: req.approval_decision || null,
    note: req.approval_note || null,
  };
}

function allow(keys, body) {
  const unknown = Object.keys(body).filter((key) => !keys.includes(key));
  return unknown.length ? unknown : null;
}

export async function createPhoneServer(options) {
  const root = options.root;
  const token = options.token;
  const host = options.host || "127.0.0.1";
  const port = options.port ?? 0;
  const limit = options.rateLimit ?? 60;
  const windowMs = options.rateWindowMs ?? 60_000;
  const tokenNotAfter = options.tokenNotAfter || null;
  if (tokenNotAfter && Number.isNaN(Date.parse(tokenNotAfter))) {
    throw Object.assign(new Error("MATTER_PHONE_TOKEN_NOT_AFTER must be an ISO timestamp"), { exitCode: 78 });
  }
  if (!root) throw Object.assign(new Error("MATTER_DATA_ROOT is required"), { exitCode: 78 });
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw Object.assign(new Error(`MATTER_DATA_ROOT is unavailable: ${root}`), { exitCode: 78 });
  }
  if (typeof token !== "string" || token.length < 16) {
    throw Object.assign(new Error("MATTER_PHONE_TOKEN must be at least 16 characters"), { exitCode: 78 });
  }
  if (!isPrivateHost(host)) {
    throw Object.assign(new Error(`refusing a public bind address: ${host}`), { exitCode: 78 });
  }
  if (!isLoopback(host) && options.allowLan !== true) {
    throw Object.assign(new Error("refusing a non-loopback bind without MATTER_PHONE_ALLOW_LAN=1"), { exitCode: 78 });
  }
  const tls = Boolean(options.tlsCert && options.tlsKey);
  if (!isLoopback(host) && !tls) {
    throw Object.assign(new Error("a non-loopback bind requires TLS certificate and key files"), { exitCode: 78 });
  }
  if ((options.tlsCert && !options.tlsKey) || (!options.tlsCert && options.tlsKey)) {
    throw Object.assign(new Error("TLS requires both MATTER_PHONE_TLS_CERT and MATTER_PHONE_TLS_KEY"), { exitCode: 78 });
  }

  const execution = await loadExecution(root);
  const hits = new Map();

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
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(body));
  }

  function error(res, status, code, message) {
    send(res, status, { error: { code, message } });
  }

  function sessionState(req) {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) return "missing";
    const presented = header.slice(7);
    if (!presented || !tokensMatch(presented, token)) return "unauthorized";
    if (tokenNotAfter && Date.now() > Date.parse(tokenNotAfter)) return "session_expired";
    return "ok";
  }

  function findByClientId(clientId) {
    return Object.values(leases(root).tasks || {}).find((task) => task.requirements && task.requirements.client_message_id === clientId) || null;
  }

  function createTask(body) {
    const unknown = allow(["client_message_id", "text", "source"], body);
    if (unknown) return { status: 400, code: "unknown_field", message: `unknown field: ${unknown[0]}` };
    const clientId = String(body.client_message_id || "").trim();
    const text = String(body.text || "").trim();
    const source = body.source == null ? "text" : body.source;
    if (!clientId || clientId.length > 80) return { status: 400, code: "invalid_client_message_id", message: "client_message_id is required" };
    if (!text || text.length > 4000) return { status: 400, code: "invalid_text", message: "text is required" };
    if (source !== "text" && source !== "voice") return { status: 400, code: "invalid_source", message: "source must be text or voice" };
    const existing = findByClientId(clientId);
    if (existing) return { status: 200, body: { task: present(existing), conversation_id: existing.task_id, duplicate: true } };
    const classified = classifyTask(text);
    const stamp = now();
    const taskId = crypto.randomUUID();
    const approvalRequired = classified.classification === "APPROVAL_REQUIRED";
    const reply = approvalRequired
      ? "Recorded in the Matter task ledger. Status is WAITING_APPROVAL. This will not run until the ledger records your authorization."
      : "Recorded in the Matter task ledger. Status is QUEUED. No worker was started.";
    execution.enqueue(taskId, {
      requirements: {
        origin: "matter-phone",
        client_message_id: clientId,
        text,
        source,
        classification: classified.classification,
        protected_actions: classified.protected_actions,
        approval_state: approvalRequired ? "required" : "none",
        route: approvalRequired ? "APPROVAL_GATE" : "DETERMINISTIC_RECORD",
        routing_basis: approvalRequired
          ? "server classified a protected action; no worker started"
          : "server classified the request as harmless; no worker started",
        messages: [
          { message_id: `${taskId}:owner`, role: "owner", text, created_at: stamp },
          { message_id: `${taskId}:matter`, role: "matter", text: reply, created_at: stamp },
        ],
      },
    });
    if (approvalRequired) execution.block(taskId, "WAITING_APPROVAL", "protected action requires owner authorization");
    const task = leases(root).tasks[taskId];
    return { status: 201, body: { task: present(task), conversation_id: taskId, duplicate: false } };
  }

  function decide(taskId, body) {
    const unknown = allow(["decision", "note"], body);
    if (unknown) return { status: 400, code: "unknown_field", message: `unknown field: ${unknown[0]}` };
    const task = leases(root).tasks[taskId];
    if (!task || !task.requirements || task.requirements.origin !== "matter-phone") {
      return { status: 404, code: "not_found", message: "approval not found" };
    }
    if (body.decision !== "approve" && body.decision !== "reject") {
      return { status: 400, code: "invalid_decision", message: "decision must be approve or reject" };
    }
    if (task.requirements.classification !== "APPROVAL_REQUIRED" && task.state !== "WAITING_APPROVAL" && task.state !== "BLOCKED") {
      return { status: 409, code: "no_approval", message: "this task has no approval gate" };
    }
    const prior = task.requirements.approval_decision || null;
    if (prior && prior !== body.decision) return { status: 409, code: "already_decided", message: "this approval already has a different decision" };
    if (prior === body.decision) return { status: 200, body: { task: present(task), approval: presentApproval(task) } };
    const stamp = now();
    const note = body.note == null ? null : String(body.note).slice(0, 400);
    const messages = [...(task.requirements.messages || []), {
      message_id: `${taskId}:${body.decision}`,
      role: "matter",
      text: body.decision === "approve"
        ? "Authorization recorded on the task ledger. No worker was started."
        : "Rejection recorded on the task ledger. The task remains blocked.",
      created_at: stamp,
    }];
    execution.annotate(taskId, {
      approval_state: body.decision === "approve" ? "approved" : "denied",
      approval_decision: body.decision,
      approval_note: note,
      decided_at: stamp,
      messages,
    });
    if (body.decision === "approve") execution.release(taskId);
    else execution.block(taskId, "BLOCKED", "owner rejected");
    const updated = leases(root).tasks[taskId];
    return { status: 200, body: { task: present(updated), approval: presentApproval(updated) } };
  }

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const ip = req.socket.remoteAddress || "unknown";
      if (!limited(ip)) return error(res, 429, "rate_limited", "too many requests");
      const session = sessionState(req);
      if (req.method === "GET" && url.pathname === "/v1/health" && session === "missing") {
        return send(res, 200, { ok: true, service: "matter-phone", authenticated: false });
      }
      if (session === "session_expired") return error(res, 401, "session_expired", "phone token is past its expiry");
      if (session !== "ok") return error(res, 401, "unauthorized", "bearer token required");
      if (req.method === "GET" && url.pathname === "/v1/health") {
        const supervisor = readSupervisorHealth(root);
        return send(res, 200, {
          ok: true,
          service: "matter-phone",
          authenticated: true,
          supervisor_healthy: supervisor.health_file && supervisor.running && !supervisor.stale,
          supervisor,
        });
      }
      if (req.method === "GET" && url.pathname === "/v1/mission") {
        const supervisor = readSupervisorHealth(root);
        const queue = execution.status();
        const tasks = Object.values(leases(root).tasks || {});
        return send(res, 200, {
          supervisor_healthy: supervisor.health_file && supervisor.running && !supervisor.stale,
          supervisor,
          queue: { total: queue.total, by_state: queue.byState },
          approvals_pending: tasks.filter((task) => task.state === "WAITING_APPROVAL").length,
          agents: readAgents(root).agents,
          local_intelligence: readLocalIntelligence(root),
        });
      }
      if (req.method === "GET" && url.pathname === "/v1/tasks") {
        const tasks = Object.values(leases(root).tasks || {}).filter((task) => task.requirements && task.requirements.origin === "matter-phone").map(present).sort((a, b) => b.created_at.localeCompare(a.created_at));
        return send(res, 200, { tasks });
      }
      if (req.method === "GET" && url.pathname.startsWith("/v1/tasks/")) {
        const task = leases(root).tasks[decodeURIComponent(url.pathname.slice("/v1/tasks/".length))];
        if (!task || !task.requirements || task.requirements.origin !== "matter-phone") return error(res, 404, "not_found", "task not found");
        return send(res, 200, { task: present(task) });
      }
      if (req.method === "POST" && /\/v1\/tasks\/[^/]+\/execute$/.test(url.pathname)) {
        return error(res, 403, "execution_refused", "the phone gateway does not execute tasks");
      }
      if (req.method === "GET" && url.pathname === "/v1/conversations") {
        const conversations = Object.values(leases(root).tasks || {}).filter((task) => task.requirements && task.requirements.origin === "matter-phone").map((task) => ({
          conversation_id: task.task_id,
          created_at: task.created_at,
          updated_at: task.updated_at,
          messages: messagesFor(task),
        })).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        return send(res, 200, { conversations });
      }
      if (req.method === "GET" && url.pathname === "/v1/approvals") {
        const status = url.searchParams.get("status") || "PENDING";
        const approvals = Object.values(leases(root).tasks || {}).map(presentApproval).filter((approval) => approval && approval.status === status);
        return send(res, 200, { approvals });
      }
      if (req.method === "GET" && url.pathname === "/v1/agents") return send(res, 200, readAgents(root));
      if (req.method === "GET" && url.pathname === "/v1/activity") {
        const file = path.join(root, "LEASE_LOG.jsonl");
        const lines = existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean) : [];
        const events = lines.slice(-100).map((line) => {
          const row = JSON.parse(line);
          return { at: row.at, kind: row.event || row.kind, task_id: row.task_id || null, executed: false };
        });
        return send(res, 200, { events });
      }
      if (req.method === "POST" && (url.pathname === "/v1/tasks" || url.pathname === "/v1/conversations")) {
        const raw = await readBody(req);
        const body = parseJson(raw);
        if (body.error) return error(res, 400, "invalid_json", "request body must be JSON");
        const result = createTask(body.value);
        if (result.code) return error(res, result.status, result.code, result.message);
        return send(res, result.status, result.body);
      }
      const approvalMatch = url.pathname.match(/^\/v1\/approvals\/([^/]+)$/);
      if (req.method === "POST" && approvalMatch) {
        const raw = await readBody(req);
        const body = parseJson(raw);
        if (body.error) return error(res, 400, "invalid_json", "request body must be JSON");
        const result = decide(decodeURIComponent(approvalMatch[1]), body.value);
        if (result.code) return error(res, result.status, result.code, result.message);
        return send(res, result.status, result.body);
      }
      return error(res, 404, "not_found", "unknown route");
    } catch (err) {
      if (err && err.status) return error(res, err.status, err.code, err.message);
      return error(res, 500, "internal", "request failed");
    }
  };

  const server = tls
    ? createHttpsServer({ cert: readFileSync(options.tlsCert), key: readFileSync(options.tlsKey) }, handler)
    : createHttpServer(handler);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const scheme = tls ? "https" : "http";
      resolve({
        server,
        host,
        port: address.port,
        url: `${scheme}://${host === "::" ? "127.0.0.1" : host}:${address.port}`,
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
    const started = await createPhoneServer({
      root,
      token,
      host,
      port,
      allowLan,
      tlsCert: process.env.MATTER_PHONE_TLS_CERT || "",
      tlsKey: process.env.MATTER_PHONE_TLS_KEY || "",
      tokenNotAfter: process.env.MATTER_PHONE_TOKEN_NOT_AFTER || null,
    });
    console.log(JSON.stringify({ service: "matter-phone", url: started.url }));
  } catch (err) {
    failClosed(err.message || String(err));
  }
}

export const PHONE_CONTRACT_VERSION = 2;
