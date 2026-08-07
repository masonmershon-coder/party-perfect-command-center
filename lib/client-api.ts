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
  PorSyncMeta,
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
  DesignMatchedItem,
  PorCatalogItem,
  Quote,
  QuoteAvailabilityLineResult,
  QuoteCustomerEvent,
  QuoteLineInput,
  QuoteQueueStatus,
  SavedQuote,
} from "./types";
import type { EmailAccount, EmailConnectionInfo } from "./email-accounts";
import { CORE_AGENT_SLUGS } from "@/lib/user-roles";
import { connectionHeaders } from "./client-connection-store";
import type { MetaConnectionInfo, SocialAccount } from "./social-accounts";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: { error?: string } | null = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as { error?: string };
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : `Request failed (${response.status}).`,
    );
  }

  if (payload == null) {
    throw new Error("Empty response from server.");
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
  options?: { taskId?: string; financialAccess?: boolean },
) {
  const response = await fetch(`/api/agents/${agentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      taskId: options?.taskId,
      financialAccess: options?.financialAccess === true,
    }),
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
  const payload = await parseJson<{
    inventory: InventoryItem[];
    source?: "por" | "local";
    por?: PorSyncMeta;
  }>(await fetch("/api/inventory"));
  return payload;
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

export type GoogleAdsSetupPayload = {
  status: {
    accountEmail: string | null;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasDeveloperToken: boolean;
    hasCustomerId: boolean;
    hasRefreshToken: boolean;
    canConnectOAuth: boolean;
    canSync: boolean;
    monthlyBudgetUsd: number | null;
    customerId: string | null;
    connectedAt: string | null;
    message: string;
  };
  oauthUrl: string | null;
  redirectUri: string;
  snapshot: {
    syncedAt: string;
    customerId: string;
    campaigns: Array<{
      id: string;
      name: string;
      status: string;
      impressions: number;
      clicks: number;
      costMicros: number;
      conversions: number;
    }>;
    keywords: Array<{
      text: string;
      matchType: string;
      campaign: string;
      adGroup: string;
      impressions: number;
      clicks: number;
      costMicros: number;
    }>;
    totals: {
      impressions: number;
      clicks: number;
      costUsd: number;
      conversions: number;
    };
  } | null;
  setupSteps: string[];
};

export async function fetchGoogleAdsSetup() {
  return parseJson<GoogleAdsSetupPayload>(await fetch("/api/google-ads/setup"));
}

export async function saveGoogleAdsSetup(input: {
  accountEmail?: string;
  clientId?: string;
  clientSecret?: string;
  developerToken?: string;
  customerId?: string;
  loginCustomerId?: string;
  monthlyBudgetUsd?: number | string;
  notes?: string;
}) {
  return parseJson<{
    success: boolean;
    message: string;
    oauthUrl: string | null;
    redirectUri: string;
    status: GoogleAdsSetupPayload["status"];
  }>(
    await fetch("/api/google-ads/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function syncGoogleAds() {
  return parseJson<{
    success: boolean;
    message: string;
    snapshot: GoogleAdsSetupPayload["snapshot"];
  }>(
    await fetch("/api/google-ads/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    }),
  );
}

export async function fetchEmails(
  accountId?: EmailAccountId,
  options?: { sync?: boolean },
) {
  const params = new URLSearchParams();
  if (accountId) params.set("accountId", accountId);
  if (options?.sync) params.set("sync", "1");
  const query = params.toString() ? `?${params.toString()}` : "";
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
    sync?: {
      syncedAt: string;
      mode: "live" | "demo";
      ok: boolean;
      postsFetched: number;
      commentsFetched: number;
      addedComments: number;
      facebookOk: boolean;
      instagramOk: boolean;
      error?: string;
      isTokenInvalid?: boolean;
    } | null;
  }>(await authFetch("/api/social"));
}

export async function sendSocialReply(
  kind: "comments" | "messages",
  id: string,
  message: string,
) {
  return parseJson<{
    success: boolean;
    sentViaMeta?: boolean;
    metaReplyId?: string;
    message?: string;
    error?: string;
    isTokenInvalid?: boolean;
    item?: SocialComment | SocialDirectMessage;
  }>(
    await authFetch(`/api/social/${kind}/${id}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }),
  );
}

export async function fetchMetaSetup() {
  return parseJson<{
    live: boolean;
    status: {
      hasAppId: boolean;
      hasAppSecret: boolean;
      hasPageToken: boolean;
      hasPageId: boolean;
      hasInstagram: boolean;
      pageName: string | null;
      instagramUsername: string | null;
      connectedAt: string | null;
    };
    oauthUrl: string | null;
    redirectUri: string;
    setupSteps: string[];
  }>(await authFetch("/api/meta/setup"));
}

export async function saveMetaAppCredentials(input: {
  appId: string;
  appSecret: string;
}) {
  return parseJson<{
    success: boolean;
    message: string;
    oauthUrl: string | null;
    redirectUri: string;
  }>(
    await authFetch("/api/meta/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
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
  const payload = await parseJson<{
    bookkeeping: BookkeepingEntry[];
    source?: "por" | "local";
    por?: PorSyncMeta;
  }>(await fetch("/api/bookkeeping"));
  return payload;
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

export async function fetchJobs() {
  return parseJson<{
    total: number;
    flaggedForJosh: number;
    storeMode?: "redis" | "blob" | "ephemeral" | "local";
    applications: import("./jobs").JobApplication[];
  }>(await fetch("/api/jobs"));
}

export async function deleteJob(
  id: string,
  options: {
    reasonId: string;
    notes?: string;
    outcome: "hired" | "rejected";
  },
) {
  return parseJson<{ success: boolean; id: string; outcome?: string }>(
    await fetch("/api/jobs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        reasonId: options.reasonId,
        notes: options.notes,
        outcome: options.outcome,
      }),
    }),
  );
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

/* ─── Quoting / Booking ─── */

export type QuoteCandidateLine = {
  qty: number;
  term: string;
  candidates: Array<PorCatalogItem & { score: number }>;
};

export async function fetchQuoteCandidates(command: string, perItem = 3) {
  return parseJson<{ lines: QuoteCandidateLine[] }>(
    await fetch("/api/quote/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, perItem }),
    }),
  );
}

export async function buildQuoteFromMatchesApi(input: {
  matches: DesignMatchedItem[];
  quantities?: Record<string, number>;
  serviceLines?: QuoteLineInput[];
  customerName?: string;
  eventDate?: string;
  salesRep?: string;
}) {
  return parseJson<{
    quote: Quote;
    ticketText: string;
    emailDraft: string;
  }>(
    await fetch("/api/quote/from-matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function buildQuoteApi(input: {
  productLines: QuoteLineInput[];
  serviceLines?: QuoteLineInput[];
  customerName?: string;
  eventDate?: string;
  salesRep?: string;
  applyRounding?: boolean;
}) {
  return parseJson<{
    quote: Quote;
    ticketText: string;
    emailDraft: string;
  }>(
    await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function checkQuoteAvailabilityApi(input: {
  lines: Array<{ itemKey?: string; sku?: string; qty: number }>;
  date: string;
}) {
  return parseJson<{
    date: string;
    results: QuoteAvailabilityLineResult[];
    anyOverbooked: boolean;
  }>(
    await fetch("/api/quote/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function matchQuotePhoto(file: File, command?: string) {
  const form = new FormData();
  form.append("image", file);
  if (command?.trim()) form.append("command", command.trim());
  return parseJson<{
    matchedItems: DesignMatchedItem[];
    searchTerms: string[];
    usedVision: boolean;
    catalogReady: boolean;
    catalogTotal: number;
  }>(await fetch("/api/quote/match-photo", { method: "POST", body: form }));
}

export async function searchPorCatalogApi(q: string, limit = 8) {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });
  return parseJson<{ items: Array<PorCatalogItem & { score: number }> }>(
    await fetch(`/api/por/catalog/search?${params}`),
  );
}

export async function fetchSavedQuotes() {
  const payload = await parseJson<{ quotes: SavedQuote[] }>(
    await fetch("/api/quotes"),
  );
  return payload.quotes;
}

export async function saveQuoteToQueue(input: {
  createdBy?: string;
  status?: QuoteQueueStatus;
  customer?: Partial<QuoteCustomerEvent>;
  quote: Quote;
  emailDraft: string;
  ticketText: string;
}) {
  const payload = await parseJson<{ quote: SavedQuote }>(
    await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return payload.quote;
}

export async function updateSavedQuoteApi(
  id: string,
  patch: {
    status?: QuoteQueueStatus;
    customer?: Partial<QuoteCustomerEvent>;
    quote?: Quote;
    emailDraft?: string;
    ticketText?: string;
    createdBy?: string;
  },
) {
  const payload = await parseJson<{ quote: SavedQuote }>(
    await fetch(`/api/quotes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
  return payload.quote;
}

export async function deleteSavedQuoteApi(id: string) {
  return parseJson<{ ok: boolean }>(
    await fetch(`/api/quotes/${id}`, { method: "DELETE" }),
  );
}
