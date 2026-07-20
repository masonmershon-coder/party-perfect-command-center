import type {
  Agent,
  BookkeepingEntry,
  Conversation,
  CreateAgentInput,
  CreateBookkeepingInput,
  CreateInventoryInput,
  CreateMarketingInput,
  CreateTaskInput,
  DashboardStats,
  EmailAccountId,
  EmailItem,
  EmailPriority,
  InboxEmailStatus,
  InventoryItem,
  LiveSnapshot,
  MarketingItem,
  SavedReport,
  SanitizedConnection,
  SocialComment,
  SocialDirectMessage,
  SocialEngagementSummary,
  SocialInteractionStatus,
  SocialPlatform,
  SocialPost,
  Task,
  TaskStatus,
  ConnectionType,
} from "./types";
import type { EmailAccount, EmailConnectionInfo } from "./email-accounts";
import { CORE_AGENT_SLUGS } from "@/lib/user-roles";
import { connectionHeaders } from "./client-connection-store";
import type { MetaConnectionInfo, SocialAccount } from "./social-accounts";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Request failed.",
    );
  }

  return payload as T;
}

function authFetch(input: string, init?: RequestInit) {
  return fetch(input, {
    ...init,
    headers: {
      ...connectionHeaders(),
      ...(init?.headers ?? {}),
    },
  });
}

export async function fetchStats() {
  const payload = await parseJson<{ stats: DashboardStats }>(
    await fetch("/api/stats"),
  );
  return payload.stats;
}

export async function fetchLiveCheck() {
  return parseJson<{ snapshot: LiveSnapshot }>(await fetch("/api/live-check"));
}

export async function fetchAgents() {
  const payload = await parseJson<{ agents: Agent[] }>(
    await fetch("/api/agents"),
  );
  return payload.agents.filter((agent) =>
    CORE_AGENT_SLUGS.includes(
      agent.slug as (typeof CORE_AGENT_SLUGS)[number],
    ),
  );
}

export async function fetchGrokAgent() {
  const payload = await parseJson<{ agents: Agent[] }>(
    await fetch("/api/agents"),
  );
  return payload.agents.find((agent) => agent.slug === "grok-assistant") ?? null;
}

export async function createAgent(input: CreateAgentInput) {
  const payload = await parseJson<{ agent: Agent }>(
    await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return payload.agent;
}

export async function fetchAgentChat(agentId: string) {
  return parseJson<{ agent: Agent; conversation: Conversation }>(
    await fetch(`/api/agents/${agentId}/chat`),
  );
}

export async function streamAgentChat(
  agentId: string,
  message: string,
  onChunk: (chunk: string) => void,
  taskId?: string,
) {
  const response = await fetch(`/api/agents/${agentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, taskId }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Chat request failed.",
    );
  }

  if (!response.body) {
    throw new Error("No response stream received.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    content += decoder.decode(value, { stream: true });
    onChunk(content);
  }

  return content;
}

export async function fetchTasks(agentId?: string) {
  const query = agentId ? `?agentId=${agentId}` : "";
  const payload = await parseJson<{ tasks: Task[] }>(
    await fetch(`/api/tasks${query}`),
  );
  return payload.tasks;
}

export async function createTask(input: CreateTaskInput) {
  const payload = await parseJson<{ task: Task }>(
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return payload.task;
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  const progress =
    status === "todo" ? 0 : status === "in_progress" ? 50 : 100;

  const payload = await parseJson<{ task: Task }>(
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, progress }),
    }),
  );
  return payload.task;
}

export async function streamTaskRun(
  taskId: string,
  onChunk: (chunk: string) => void,
  onProgress?: (progress: number) => void,
) {
  const response = await fetch(`/api/tasks/${taskId}/run`, {
    method: "POST",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      typeof payload?.error === "string" ? payload.error : "Task run failed.",
    );
  }

  if (!response.body) {
    throw new Error("No response stream received.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let progress = 10;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    content += decoder.decode(value, { stream: true });
    progress = Math.min(95, progress + 2);
    onProgress?.(progress);
    onChunk(content);
  }

  onProgress?.(100);
  return content;
}

export async function fetchInventory() {
  const payload = await parseJson<{ inventory: InventoryItem[] }>(
    await fetch("/api/inventory"),
  );
  return payload.inventory;
}

export async function createInventoryItem(input: CreateInventoryInput) {
  const payload = await parseJson<{ item: InventoryItem }>(
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return payload.item;
}

export async function fetchMarketing() {
  const payload = await parseJson<{ marketing: MarketingItem[] }>(
    await fetch("/api/marketing"),
  );
  return payload.marketing;
}

export async function createMarketingItem(input: CreateMarketingInput) {
  const payload = await parseJson<{ item: MarketingItem }>(
    await fetch("/api/marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return payload.item;
}

export async function fetchEmails(accountId?: EmailAccountId) {
  const query = accountId ? `?accountId=${accountId}` : "";
  return parseJson<{
    accounts: EmailAccount[];
    connection: EmailConnectionInfo;
    emails: EmailItem[];
  }>(await authFetch(`/api/emails${query}`));
}

export async function fetchConnections() {
  return parseJson<{ connections: SanitizedConnection[] }>(
    await authFetch("/api/connections"),
  );
}

export async function connectAccount(input: {
  type: ConnectionType;
  accountKey: string;
  label: string;
}) {
  const payload = await parseJson<{ connection: SanitizedConnection }>(
    await authFetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return payload.connection;
}

export async function disconnectAccount(input: {
  type?: ConnectionType;
  accountKey?: string;
  sessionToken?: string;
}) {
  return parseJson<{ success: boolean }>(
    await authFetch("/api/connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function fetchSocial() {
  return parseJson<{
    accounts: SocialAccount[];
    connection: MetaConnectionInfo;
    oauthUrls: Record<SocialPlatform, string | null>;
    engagement: SocialEngagementSummary[];
    posts: SocialPost[];
    comments: SocialComment[];
    messages: SocialDirectMessage[];
  }>(await authFetch("/api/social"));
}

export async function updateSocialItem(
  kind: "comments" | "messages",
  id: string,
  status: SocialInteractionStatus,
) {
  const payload = await parseJson<{ item: SocialComment | SocialDirectMessage }>(
    await authFetch(`/api/social/${kind}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }),
  );
  return payload.item;
}

export async function streamSocialDraftReply(
  kind: "comments" | "messages",
  id: string,
  input: { instructions?: string; tone?: "professional" | "friendly" | "concise" },
  onChunk: (chunk: string) => void,
) {
  const response = await authFetch(`/api/social/${kind}/${id}/draft-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Failed to draft social reply.",
    );
  }

  if (!response.body) {
    throw new Error("No response stream received.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    content += decoder.decode(value, { stream: true });
    onChunk(content);
  }

  return content;
}

export async function updateEmail(
  id: string,
  patch: { status?: InboxEmailStatus; priority?: EmailPriority },
) {
  const payload = await parseJson<{ email: EmailItem }>(
    await authFetch(`/api/emails/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
  return payload.email;
}

export async function updateEmailStatus(id: string, status: InboxEmailStatus) {
  return updateEmail(id, { status });
}

export async function streamEmailDraftReply(
  emailId: string,
  input: { instructions?: string; tone?: "professional" | "friendly" | "concise" },
  onChunk: (chunk: string) => void,
) {
  const response = await fetch(`/api/emails/${emailId}/draft-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Failed to draft reply.",
    );
  }

  if (!response.body) {
    throw new Error("No response stream received.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    content += decoder.decode(value, { stream: true });
    onChunk(content);
  }

  return content;
}

export async function fetchBookkeeping() {
  const payload = await parseJson<{ bookkeeping: BookkeepingEntry[] }>(
    await fetch("/api/bookkeeping"),
  );
  return payload.bookkeeping;
}

export async function createBookkeepingEntry(input: CreateBookkeepingInput) {
  const payload = await parseJson<{ entry: BookkeepingEntry }>(
    await fetch("/api/bookkeeping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return payload.entry;
}

export async function exportToGitHub(input: {
  repo?: string;
  branch?: string;
  message?: string;
}) {
  return parseJson<{
    success: boolean;
    url: string;
    path: string;
    fileCount: number;
  }>(
    await fetch("/api/export/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function sendWeeklyRecapSms() {
  return parseJson<{
    success: boolean;
    message: string;
    recap: string;
    from?: string;
    fromDisplay?: string;
    to?: string;
    toDisplay?: string;
    twilioSid?: string;
    reportSaved?: boolean;
  }>(
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "weekly-recap" }),
    }),
  );
}

export async function sendTestSms() {
  return parseJson<{
    success: boolean;
    message: string;
    from?: string;
    fromDisplay?: string;
    to?: string;
    toDisplay?: string;
    twilioSid?: string;
    body?: string;
  }>(
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test-sample" }),
    }),
  );
}

export async function fetchTwilioStatus() {
  return parseJson<{
    twilio: {
      configured: boolean;
      fromNumber: string | null;
      fromDisplay: string | null;
      toNumber: string;
      toDisplay: string;
      accountSidSet: boolean;
      authTokenSet: boolean;
      authTokenLooksIncomplete: boolean;
    };
  }>(await fetch("/api/send-sms"));
}

export async function fetchReports() {
  const payload = await parseJson<{ reports: SavedReport[] }>(
    await fetch("/api/reports"),
  );
  return payload.reports;
}

export async function generateWeeklyRecapReport() {
  const payload = await parseJson<{ report: SavedReport }>(
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate-weekly-recap" }),
    }),
  );
  return payload.report;
}
