/**
 * Read-only Security Inbox. Sentinel defaults read-only.
 * No general admin, no firewall/SQL/POR credentials, no business authority.
 *
 * Collector ledger (SECURITY_EVENTS.jsonl) is read, never rewritten here.
 * App-emitted telemetry lives in durable sentinel-app-events.json.
 */

import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readDurableJson, writeDurableJson } from "./durable-json";

export const SENTINEL_APP_EVENTS_KEY = "sentinel-app-events.json";

export type SentinelEventSource = "collector" | "app";

export type SentinelInboxEvent = {
  id: string;
  ts: string;
  severity: string;
  kind: string;
  title: string;
  summary: string;
  status: string;
  source: SentinelEventSource;
  asset?: string;
  relatedTask?: string;
  signalCount?: number;
  signalIds?: string[];
  ipPrefix?: string;
  uaFamily?: string;
  sessionHash?: string;
  outcome?: string;
  role?: string;
};

type DurableAppStore = {
  events: Array<Record<string, unknown>>;
  lastHash: string;
};

const SENSITIVE_KEY =
  /^(password|secret|token|pin|ssn|email|phone|api[_-]?key|authorization|cookie|sessiontoken|raw|prompt|matchedtext)$/i;

function redactText(value: unknown): string {
  const s = typeof value === "string" ? value : value == null ? "" : String(value);
  return s
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]")
    .replace(
      /(password|secret|token|api[_-]?key|pin)\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .slice(0, 400);
}

function stripSensitiveFields(
  rec: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (SENSITIVE_KEY.test(k)) continue;
    if (typeof v === "string") out[k] = redactText(v);
    else if (v == null || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = v.slice(0, 12);
    }
  }
  return out;
}

function collectorToInbox(rec: Record<string, unknown>): SentinelInboxEvent {
  const clean = stripSensitiveFields(rec);
  const kind = String(clean.event_type || clean.kind || "UNKNOWN");
  const id = String(clean.event_id || clean.id || kind);
  return {
    id,
    ts: String(clean.timestamp || clean.ts || clean.created_at || ""),
    severity: String(clean.severity || "WATCH"),
    kind,
    title: kind.replace(/_/g, " "),
    summary: redactText(clean.description || clean.summary || ""),
    status: String(clean.status || "OPEN"),
    source: "collector",
    asset: clean.asset ? redactText(clean.asset) : undefined,
    relatedTask: clean.related_task ? String(clean.related_task) : undefined,
  };
}

function appToInbox(rec: Record<string, unknown>): SentinelInboxEvent {
  const clean = stripSensitiveFields(rec);
  const kind = String(clean.kind || "APP_EVENT");
  return {
    id: String(clean.id || kind),
    ts: String(clean.ts || ""),
    severity: String(clean.severity || "WATCH"),
    kind,
    title: String(clean.title || kind.replace(/_/g, " ")),
    summary: redactText(clean.summary || ""),
    status: String(clean.status || "OPEN"),
    source: "app",
    signalCount:
      typeof clean.signalCount === "number" ? clean.signalCount : undefined,
    signalIds: Array.isArray(clean.signalIds)
      ? (clean.signalIds as string[])
      : undefined,
    ipPrefix: clean.ipPrefix ? String(clean.ipPrefix) : undefined,
    uaFamily: clean.uaFamily ? String(clean.uaFamily) : undefined,
    sessionHash: clean.sessionHash ? String(clean.sessionHash) : undefined,
    outcome: clean.outcome ? String(clean.outcome) : undefined,
    role: clean.role ? String(clean.role) : undefined,
  };
}

async function readCollectorLedger(): Promise<SentinelInboxEvent[]> {
  const file = path.join(process.cwd(), "AI-HANDOFF", "SECURITY_EVENTS.jsonl");
  try {
    const raw = await fs.readFile(file, "utf8");
    const events: SentinelInboxEvent[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(collectorToInbox(JSON.parse(line) as Record<string, unknown>));
      } catch {
        // skip malformed
      }
    }
    return events;
  } catch {
    return [];
  }
}

async function readAppStore(): Promise<DurableAppStore> {
  const store = await readDurableJson<DurableAppStore>(SENTINEL_APP_EVENTS_KEY, {
    events: [],
    lastHash: "GENESIS",
  });
  return {
    events: Array.isArray(store?.events) ? store.events : [],
    lastHash: typeof store?.lastHash === "string" ? store.lastHash : "GENESIS",
  };
}

export async function listSentinelInboxEvents(limit = 200): Promise<{
  events: SentinelInboxEvent[];
  total: number;
}> {
  const [collector, app] = await Promise.all([
    readCollectorLedger(),
    readAppStore(),
  ]);
  const merged = [
    ...collector,
    ...app.events.map((row) => appToInbox(row)),
  ].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  return { events: merged.slice(0, limit), total: merged.length };
}

export async function getSentinelInboxEvent(
  id: string,
): Promise<SentinelInboxEvent | null> {
  const { events } = await listSentinelInboxEvents(500);
  return events.find((e) => e.id === id) ?? null;
}

export async function injectionSignalTotals(): Promise<{
  events: number;
  signalCount: number;
  byId: Record<string, number>;
}> {
  const { events } = await listSentinelInboxEvents(500);
  const inj = events.filter(
    (e) =>
      e.kind === "PROMPT_INJECTION_SUSPECTED" ||
      (e.signalCount != null && e.signalCount > 0),
  );
  const byId: Record<string, number> = {};
  let signalCount = 0;
  for (const e of inj) {
    signalCount += e.signalCount ?? 0;
    for (const id of e.signalIds ?? []) {
      byId[id] = (byId[id] ?? 0) + 1;
    }
  }
  return { events: inj.length, signalCount, byId };
}

export async function appendSentinelAppEvent(input: {
  kind: string;
  severity?: string;
  title?: string;
  summary?: string;
  signalCount?: number;
  signalIds?: string[];
  ipPrefix?: string;
  uaFamily?: string;
  sessionHash?: string;
  outcome?: string;
  role?: string;
}): Promise<SentinelInboxEvent> {
  const store = await readAppStore();
  const id = randomBytes(6).toString("hex");
  const ts = new Date().toISOString();
  const rec = stripSensitiveFields({
    id,
    ts,
    kind: input.kind,
    severity: input.severity || "WATCH",
    title: input.title || input.kind.replace(/_/g, " "),
    summary: redactText(input.summary || ""),
    status: "OPEN",
    signalCount: input.signalCount,
    signalIds: input.signalIds,
    ipPrefix: input.ipPrefix,
    uaFamily: input.uaFamily,
    sessionHash: input.sessionHash,
    outcome: input.outcome,
    role: input.role,
  });
  const thisHash = createHash("sha256")
    .update(`${store.lastHash}|${id}|${ts}|${input.kind}`)
    .digest("hex")
    .slice(0, 16);
  rec.prev_hash = store.lastHash;
  rec.this_hash = thisHash;
  store.events.push(rec);
  if (store.events.length > 2000) {
    store.events = store.events.slice(-1500);
  }
  store.lastHash = thisHash;
  await writeDurableJson(SENTINEL_APP_EVENTS_KEY, store);
  return appToInbox(rec);
}
