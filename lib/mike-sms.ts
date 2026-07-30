import { createHmac, timingSafeEqual } from "crypto";
import { assertGrokConfigured, grokClient } from "@/lib/grok";
import { MIKE_VOICE } from "@/lib/agent-voices";
import { MIKE_OPERATIONS_AGENT_ID } from "@/lib/seed";
import {
  createReport,
  createTask,
  getDashboardStats,
  listTasks,
} from "@/lib/storage";
import { listJobApplications } from "@/lib/job-applications";
import {
  getPorSnapshot,
  getPorSyncMeta,
} from "@/lib/por-snapshot";
import { generateWeeklyRecapMessage } from "@/lib/weekly-recap";
import { getAuthorizedManagerPhones, getTwilioConfig } from "@/lib/twilio";
import { readDurableJson, writeDurableJson } from "@/lib/durable-json";

const THREAD_KEY = "mike-sms-thread.json";
const MAX_REPLY = 1400;
const MAX_HISTORY = 12;

type SmsAction =
  | "reply"
  | "help"
  | "status"
  | "hiring"
  | "weekly_recap"
  | "create_task";

interface ParsedIntent {
  action: SmsAction;
  reply?: string;
  taskTitle?: string;
  taskDescription?: string;
  taskPriority?: "low" | "medium" | "high";
}

interface SmsTurn {
  role: "josh" | "mike";
  body: string;
  at: string;
}

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

/** Normalize to comparable 10/11 digit US forms. */
export function phonesMatch(a: string, b: string) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  const na = da.length === 11 && da.startsWith("1") ? da.slice(1) : da;
  const nb = db.length === 11 && db.startsWith("1") ? db.slice(1) : db;
  return na === nb;
}

export function isAuthorizedSender(from: string) {
  try {
    return getAuthorizedManagerPhones().some((phone) => phonesMatch(from, phone));
  } catch {
    return false;
  }
}

/**
 * Validate Twilio request signature (X-Twilio-Signature).
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
export function validateTwilioSignature(input: {
  url: string;
  params: Record<string, string>;
  signature: string | null;
}) {
  const authToken = getTwilioConfig()?.authToken;
  if (!authToken || !input.signature) return false;

  const sorted = Object.keys(input.params)
    .sort()
    .reduce((acc, key) => acc + key + input.params[key], input.url);

  const digest = createHmac("sha1", authToken).update(sorted, "utf8").digest("base64");

  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(input.signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function twimlMessage(body: string) {
  const safe = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, MAX_REPLY);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

export function emptyTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}

async function readThread(): Promise<SmsTurn[]> {
  const parsed = await readDurableJson<SmsTurn[]>(THREAD_KEY, []);
  return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
}

async function appendThread(turns: SmsTurn[]) {
  const existing = await readThread();
  const next = [...existing, ...turns].slice(-MAX_HISTORY);
  await writeDurableJson(THREAD_KEY, next);
}

function helpText() {
  return [
    "Mike here. Text me like this:",
    "• status — what's open today",
    "• hiring — top candidates",
    "• recap — weekly ops SMS",
    "• create task: <title> — add a Command Center task",
    "Or just tell me what you need.",
  ].join("\n");
}

async function buildStatusReply() {
  const [stats, tasks, apps, por] = await Promise.all([
    getDashboardStats(),
    listTasks(),
    listJobApplications(),
    getPorSnapshot(),
  ]);
  const open = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  const flagged = apps.filter((a) => a.mike.flagForJosh).length;
  const topOpen = open
    .slice(0, 4)
    .map((t) => `• ${t.title.slice(0, 50)}`)
    .join("\n");
  const porMeta = getPorSyncMeta(por);
  const porLine = por
    ? `POR${porMeta.stale ? " (stale)" : ""}: AR $${por.money.arOpenBalance.toFixed(0)} · out ${por.inventory.outQuantity} · deliveries ${por.ops.deliveriesToday} · returns ${por.ops.returnsDueToday}`
    : "POR: no live snapshot yet";

  return [
    "Mike · status",
    `Tasks open: ${open.length} · Emails needing reply: ${stats.emailsNeedsReply} · Social needing reply: ${stats.socialNeedsReply}`,
    porLine,
    flagged ? `Hiring flagged for you: ${flagged}` : "Hiring: no flagged candidates",
    topOpen ? `Next:\n${topOpen}` : "No open tasks.",
  ]
    .join("\n")
    .slice(0, MAX_REPLY);
}

async function buildHiringReply() {
  const apps = await listJobApplications();
  const flagged = apps
    .filter((a) => a.mike.flagForJosh)
    .sort((a, b) => b.mike.score - a.mike.score)
    .slice(0, 5);

  if (flagged.length === 0) {
    const top = [...apps].sort((a, b) => b.mike.score - a.mike.score).slice(0, 3);
    if (top.length === 0) {
      return "Mike · hiring: no applications yet. New apps land in Command Center → Hiring.";
    }
    return [
      "Mike · hiring (no 70+ flags yet). Top scores:",
      ...top.map(
        (a) =>
          `• ${a.fullName} ${a.mike.score} — ${a.mike.primaryFit}`,
      ),
    ]
      .join("\n")
      .slice(0, MAX_REPLY);
  }

  return [
    `Mike · ${flagged.length} top candidate${flagged.length === 1 ? "" : "s"} for you:`,
    ...flagged.map(
      (a) =>
        `• ${a.fullName} ${a.mike.score} — ${a.mike.primaryFit} · ${a.phone}`,
    ),
  ]
    .join("\n")
    .slice(0, MAX_REPLY);
}

async function runWeeklyRecap() {
  const content = await generateWeeklyRecapMessage();
  await createReport({
    type: "weekly-recap",
    title: `Weekly Operations Recap — ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date())}`,
    content,
    generatedAt: new Date().toISOString(),
    sentViaSms: true,
    generatedBy: "mike-operations",
  });
  return content.slice(0, MAX_REPLY);
}

function heuristicIntent(body: string): ParsedIntent | null {
  const text = body.trim().toLowerCase();
  if (!text) return { action: "help", reply: helpText() };

  if (/^(help|\?|commands|menu)\b/.test(text)) {
    return { action: "help", reply: helpText() };
  }
  if (/^(status|what's up|whats up|update|ops)\b/.test(text)) {
    return { action: "status" };
  }
  if (/^(hiring|candidates|applicants|jobs)\b/.test(text)) {
    return { action: "hiring" };
  }
  if (/^(recap|weekly|weekly recap)\b/.test(text)) {
    return { action: "weekly_recap" };
  }

  const createMatch = text.match(
    /^(?:create\s+task|add\s+task|new\s+task|task)[:\-\s]+(.+)$/i,
  );
  if (createMatch?.[1]) {
    const title = createMatch[1].trim().slice(0, 120);
    return {
      action: "create_task",
      taskTitle: title,
      taskDescription: `Requested by Josh via SMS: ${title}`,
      taskPriority: "medium",
    };
  }

  return null;
}

async function parseWithGrok(body: string, history: SmsTurn[]): Promise<ParsedIntent> {
  assertGrokConfigured();

  const historyBlock = history
    .map((t) => `${t.role === "josh" ? "Josh" : "Mike"}: ${t.body}`)
    .join("\n");

  const response = await grokClient.responses.create({
    model: "grok-build-0.1",
    input: [
      {
        role: "system",
        content: [
          MIKE_VOICE,
          "Josh (owner) texts you commands and questions by SMS.",
          "Return ONLY valid JSON with keys:",
          'action: one of reply | help | status | hiring | weekly_recap | create_task',
          "reply: string (required for action=reply; SMS-length, under 300 chars preferred)",
          "taskTitle, taskDescription, taskPriority (low|medium|high) when action=create_task",
          "If Josh asks you to do something operational that maps to status/hiring/recap/create_task, use that action.",
          "For general questions, use action=reply with a direct helpful answer.",
          "Never invent private data you do not have.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          historyBlock ? `Recent SMS thread:\n${historyBlock}` : "No prior SMS thread.",
          "",
          `Josh's new text:\n${body}`,
        ].join("\n"),
      },
    ],
    stream: false,
  });

  const text =
    typeof response.output_text === "string" ? response.output_text.trim() : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      action: "reply",
      reply: "Got it. Try: status, hiring, recap, or create task: <title>.",
    };
  }

  const parsed = JSON.parse(match[0]) as Partial<ParsedIntent>;
  const action = (
    [
      "reply",
      "help",
      "status",
      "hiring",
      "weekly_recap",
      "create_task",
    ] as SmsAction[]
  ).includes(parsed.action as SmsAction)
    ? (parsed.action as SmsAction)
    : "reply";

  return {
    action,
    reply: typeof parsed.reply === "string" ? parsed.reply.trim() : undefined,
    taskTitle:
      typeof parsed.taskTitle === "string" ? parsed.taskTitle.trim() : undefined,
    taskDescription:
      typeof parsed.taskDescription === "string"
        ? parsed.taskDescription.trim()
        : undefined,
    taskPriority:
      parsed.taskPriority === "low" ||
      parsed.taskPriority === "medium" ||
      parsed.taskPriority === "high"
        ? parsed.taskPriority
        : "medium",
  };
}

async function executeIntent(intent: ParsedIntent, originalBody: string) {
  switch (intent.action) {
    case "help":
      return intent.reply?.trim() || helpText();
    case "status":
      return buildStatusReply();
    case "hiring":
      return buildHiringReply();
    case "weekly_recap":
      return runWeeklyRecap();
    case "create_task": {
      const title =
        intent.taskTitle?.trim() ||
        originalBody.replace(/^(create|add|new)\s+task[:\-\s]*/i, "").trim() ||
        "SMS task from Josh";
      const description =
        intent.taskDescription?.trim() ||
        `Requested by Josh via SMS.\n\nOriginal text: ${originalBody}`;
      const task = await createTask({
        agentId: MIKE_OPERATIONS_AGENT_ID,
        title: title.slice(0, 160),
        description: description.slice(0, 2000),
        priority: intent.taskPriority ?? "medium",
      });
      return `Done — task created: "${task.title}" (todo). I'll track it in Command Center.`;
    }
    case "reply":
    default:
      return (
        intent.reply?.trim() ||
        "Got it. Text HELP for commands, or tell me what you need."
      );
  }
}

/**
 * Process an inbound SMS from Josh and return Mike's reply body.
 */
export async function handleMikeInboundSms(body: string): Promise<string> {
  const trimmed = body.trim().slice(0, 1600);
  if (!trimmed) return helpText();

  const history = await readThread();
  let intent = heuristicIntent(trimmed);

  if (!intent) {
    try {
      intent = await parseWithGrok(trimmed, history);
    } catch {
      intent = {
        action: "reply",
        reply:
          "I'm having trouble thinking right now. Try: status, hiring, recap, or create task: <title>.",
      };
    }
  }

  let reply: string;
  try {
    reply = await executeIntent(intent, trimmed);
  } catch (error) {
    reply =
      error instanceof Error
        ? `Couldn't finish that: ${error.message.slice(0, 200)}`
        : "Couldn't finish that. Try again in a minute.";
  }

  reply = reply.trim().slice(0, MAX_REPLY);
  await appendThread([
    { role: "josh", body: trimmed, at: new Date().toISOString() },
    { role: "mike", body: reply, at: new Date().toISOString() },
  ]);

  return reply;
}
