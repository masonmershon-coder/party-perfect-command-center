import { promises as fs } from "fs";
import path from "path";
import { getDataDir } from "./data-dir";
import {
  deleteDurableJson,
  listDurableKeys,
  readDurableJson,
  writeDurableJson,
} from "./durable-json";
import { compareEmailsByPriority, inferEmailPriority } from "./email-priority";
import {
  DEFAULT_AGENTS,
  DEFAULT_BOOKKEEPING,
  DEFAULT_EMAILS,
  DEFAULT_INVENTORY,
  DEFAULT_MARKETING,
  DEFAULT_REPORTS,
  DEFAULT_SOCIAL,
  DEFAULT_TASKS,
  defaultModelForAgent,
  slugify,
} from "./seed";
import {
  bookkeepingFromPorSnapshot,
  getPorSnapshot,
  getPorSyncMeta,
  inventoryFromPorSnapshot,
  porInventoryTotals,
} from "./por-snapshot";
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
  EmailItem,
  InboxEmailStatus,
  EmailPriority,
  InventoryItem,
  MarketingItem,
  Message,
  SocialComment,
  SocialDirectMessage,
  SocialEngagementSummary,
  SocialPlatform,
  SocialPost,
  SavedReport,
  Task,
  TaskStatus,
} from "./types";

const DATA_DIR = getDataDir();
const AGENTS_FILE = path.join(DATA_DIR, "agents.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");
const MARKETING_FILE = path.join(DATA_DIR, "marketing.json");
const EMAILS_FILE = path.join(DATA_DIR, "emails.json");
const SOCIAL_FILE = path.join(DATA_DIR, "social.json");
const BOOKKEEPING_FILE = path.join(DATA_DIR, "bookkeeping.json");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
const CONVERSATIONS_DIR = path.join(DATA_DIR, "conversations");

function storeKeyFor(filePath: string) {
  const relative = path.relative(DATA_DIR, filePath);
  return relative.split(path.sep).join("/");
}

async function ensureDataDir() {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  return readDurableJson<T>(storeKeyFor(filePath), fallback);
}

async function writeJsonFile(filePath: string, data: unknown) {
  await ensureDataDir();
  await writeDurableJson(storeKeyFor(filePath), data);
}

/** Seed writes must not take down the dashboard if Blob quota/token fails. */
async function writeJsonFileBestEffort(filePath: string, data: unknown) {
  try {
    await writeJsonFile(filePath, data);
  } catch (error) {
    console.error(
      `[storage] best-effort write failed (${storeKeyFor(filePath)}):`,
      error instanceof Error ? error.message : error,
    );
  }
}

function now() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

function normalizeTaskStatus(status: string): TaskStatus {
  if (status === "pending") return "todo";
  if (status === "completed" || status === "failed") return "done";
  if (status === "in_progress") return "in_progress";
  return status as TaskStatus;
}

function normalizeTasks(tasks: Task[]): Task[] {
  return tasks.map((task) => ({
    ...task,
    status: normalizeTaskStatus(task.status),
  }));
}

function normalizeInboxEmailStatus(status: string): InboxEmailStatus {
  if (
    status === "unread" ||
    status === "read" ||
    status === "replied" ||
    status === "archived"
  ) {
    return status;
  }
  if (status === "draft" || status === "scheduled") return "unread";
  return "read";
}

function needsReplyEmail(status: InboxEmailStatus) {
  return status !== "replied" && status !== "archived";
}

function normalizeEmailPriority(value: unknown, subject: string, preview: string): EmailPriority {
  if (
    value === "urgent" ||
    value === "business" ||
    value === "general" ||
    value === "low"
  ) {
    return value;
  }
  return inferEmailPriority(subject, preview);
}

function normalizeEmailItem(raw: EmailItem & Record<string, unknown>): EmailItem {
  const timestamp = typeof raw.updatedAt === "string" ? raw.updatedAt : now();
  const subject = String(raw.subject ?? "");
  const preview = String(raw.preview ?? "");

  if (raw.accountId && raw.sender && raw.body) {
    return {
      id: String(raw.id),
      accountId: raw.accountId as EmailItem["accountId"],
      subject,
      sender: String(raw.sender ?? ""),
      senderEmail: String(raw.senderEmail ?? ""),
      preview,
      body: String(raw.body ?? preview),
      receivedAt: String(raw.receivedAt ?? timestamp),
      status: normalizeInboxEmailStatus(String(raw.status ?? "unread")),
      priority: normalizeEmailPriority(raw.priority, subject, preview),
      repliedAt:
        typeof raw.repliedAt === "string"
          ? raw.repliedAt
          : normalizeInboxEmailStatus(String(raw.status ?? "")) === "replied"
            ? timestamp
            : undefined,
      updatedAt: timestamp,
      messageId:
        typeof raw.messageId === "string" ? raw.messageId : undefined,
      source: raw.source === "imap" || raw.source === "demo" ? raw.source : undefined,
    };
  }

  const legacyRecipient = String(raw.recipient ?? "unknown@example.com");
  const legacyPreview = preview;
  const legacyStatus = String(raw.status ?? "read");

  return {
    id: String(raw.id),
    accountId: "company",
    subject: subject || "Untitled",
    sender: legacyRecipient.split("@")[0] ?? "Contact",
    senderEmail: legacyRecipient,
    preview: legacyPreview,
    body: legacyPreview,
    receivedAt: timestamp,
    status: normalizeInboxEmailStatus(legacyStatus),
    priority: normalizeEmailPriority(raw.priority, subject, legacyPreview),
    updatedAt: timestamp,
  };
}

function normalizeEmails(emails: EmailItem[]): EmailItem[] {
  return emails.map((email) =>
    normalizeEmailItem(email as EmailItem & Record<string, unknown>),
  );
}

interface SocialDataFile {
  posts: SocialPost[];
  comments: SocialComment[];
  messages: SocialDirectMessage[];
}

function seedSocialData(): SocialDataFile {
  const posts: SocialPost[] = DEFAULT_SOCIAL.posts.map((post) => ({
    ...post,
    id: createId(),
  }));

  const postIdBySeedKey: Record<string, string> = {
    "post-instagram-1": posts[0]?.id ?? "",
    "post-facebook-1": posts[1]?.id ?? "",
  };

  const comments: SocialComment[] = DEFAULT_SOCIAL.comments.map((comment) => ({
    ...comment,
    id: createId(),
    postId: postIdBySeedKey[comment.postId] ?? posts[0]?.id ?? createId(),
  }));

  const messages: SocialDirectMessage[] = DEFAULT_SOCIAL.messages.map(
    (message) => ({
      ...message,
      id: createId(),
    }),
  );

  return { posts, comments, messages };
}

export async function ensurePartyPerfectSeed() {
  await ensureDataDir();

  const existingAgents = await readJsonFile<Agent[]>(AGENTS_FILE, []);
  const timestamp = now();

  if (existingAgents.length === 0) {
    const agents: Agent[] = DEFAULT_AGENTS.map((agent) => ({
      ...agent,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await writeJsonFileBestEffort(AGENTS_FILE, agents);

    for (const agent of agents) {
      await writeJsonFileBestEffort(path.join(CONVERSATIONS_DIR, `${agent.id}.json`), {
        agentId: agent.id,
        messages: [],
        updatedAt: timestamp,
      } satisfies Conversation);
    }
  } else {
    const existingIds = new Set(existingAgents.map((agent) => agent.id));
    const mergedAgents = [...existingAgents];
    let changed = false;

    for (const seed of DEFAULT_AGENTS) {
      if (!existingIds.has(seed.id)) {
        mergedAgents.push({
          ...seed,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        changed = true;
        await writeJsonFileBestEffort(path.join(CONVERSATIONS_DIR, `${seed.id}.json`), {
          agentId: seed.id,
          messages: [],
          updatedAt: timestamp,
        } satisfies Conversation);
      }
    }

    if (changed) {
      await writeJsonFileBestEffort(AGENTS_FILE, mergedAgents);
    }

    const coreIds = new Set(DEFAULT_AGENTS.map((agent) => agent.id));
    let synced = false;
    const syncedAgents = mergedAgents.map((agent) => {
      if (!coreIds.has(agent.id)) return agent;
      const seed = DEFAULT_AGENTS.find((entry) => entry.id === agent.id);
      if (!seed) return agent;
      if (
        agent.name === seed.name &&
        agent.description === seed.description &&
        agent.goal === seed.goal &&
        agent.icon === seed.icon
      ) {
        return agent;
      }
      synced = true;
      return {
        ...agent,
        name: seed.name,
        description: seed.description,
        goal: seed.goal,
        icon: seed.icon,
        slug: seed.slug,
        updatedAt: timestamp,
      };
    });

    if (synced) {
      await writeJsonFileBestEffort(AGENTS_FILE, syncedAgents);
    }
  }

  const existingTasks = await readJsonFile<Task[]>(TASKS_FILE, []);
  if (existingTasks.length === 0) {
    const timestamp = now();
    const tasks: Task[] = DEFAULT_TASKS.map((task) => ({
      ...task,
      id: createId(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await writeJsonFileBestEffort(TASKS_FILE, tasks);
  }

  const existingInventory = await readJsonFile<InventoryItem[]>(
    INVENTORY_FILE,
    [],
  );
  if (existingInventory.length === 0) {
    const timestamp = now();
    const inventory: InventoryItem[] = DEFAULT_INVENTORY.map((item) => ({
      ...item,
      id: createId(),
      updatedAt: timestamp,
    }));
    await writeJsonFileBestEffort(INVENTORY_FILE, inventory);
  }

  const existingMarketing = await readJsonFile<MarketingItem[]>(
    MARKETING_FILE,
    [],
  );
  if (existingMarketing.length === 0) {
    const timestamp = now();
    const marketing: MarketingItem[] = DEFAULT_MARKETING.map((item) => ({
      ...item,
      id: createId(),
      updatedAt: timestamp,
    }));
    await writeJsonFileBestEffort(MARKETING_FILE, marketing);
  }

  const existingEmails = await readJsonFile<EmailItem[]>(EMAILS_FILE, []);
  const isLegacyInbox = existingEmails.some((email) => !("accountId" in email));

  if (existingEmails.length === 0 || isLegacyInbox) {
    const timestamp = now();
    const emails: EmailItem[] = DEFAULT_EMAILS.map((item) => ({
      ...item,
      id: createId(),
      updatedAt: timestamp,
    }));
    await writeJsonFileBestEffort(EMAILS_FILE, emails);
  }

  const existingSocial = await readJsonFile<SocialDataFile | null>(
    SOCIAL_FILE,
    null,
  );
  if (!existingSocial?.posts?.length) {
    await writeJsonFileBestEffort(SOCIAL_FILE, seedSocialData());
  }

  const existingBookkeeping = await readJsonFile<BookkeepingEntry[]>(
    BOOKKEEPING_FILE,
    [],
  );
  if (existingBookkeeping.length === 0) {
    const timestamp = now();
    const bookkeeping: BookkeepingEntry[] = DEFAULT_BOOKKEEPING.map((item) => ({
      ...item,
      id: createId(),
      updatedAt: timestamp,
    }));
    await writeJsonFileBestEffort(BOOKKEEPING_FILE, bookkeeping);
  }

  const existingReports = await readJsonFile<SavedReport[]>(REPORTS_FILE, []);
  if (existingReports.length === 0) {
    const reports: SavedReport[] = DEFAULT_REPORTS.map((item) => ({
      ...item,
      id: createId(),
    }));
    await writeJsonFileBestEffort(REPORTS_FILE, reports);
  }
}

export async function listAgents(): Promise<Agent[]> {
  await ensurePartyPerfectSeed();
  return readJsonFile<Agent[]>(AGENTS_FILE, []);
}

export async function getAgent(id: string): Promise<Agent | null> {
  const agents = await listAgents();
  return agents.find((agent) => agent.id === id) ?? null;
}

export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const slug = slugify(input.name);
  const agent: Agent = {
    id: createId(),
    slug,
    name: input.name.trim(),
    description: input.description?.trim() ?? input.goal.trim(),
    goal: input.goal.trim(),
    status: "idle",
    model: input.model ?? defaultModelForAgent(slug),
    icon: input.icon ?? "🤖",
    createdAt: now(),
    updatedAt: now(),
  };

  const agents = await listAgents();
  agents.unshift(agent);
  await writeJsonFile(AGENTS_FILE, agents);
  await writeJsonFile(path.join(CONVERSATIONS_DIR, `${agent.id}.json`), {
    agentId: agent.id,
    messages: [],
    updatedAt: now(),
  } satisfies Conversation);

  return agent;
}

export async function updateAgent(
  id: string,
  patch: Partial<Pick<Agent, "name" | "goal" | "status" | "model" | "description">>,
): Promise<Agent | null> {
  const agents = await listAgents();
  const index = agents.findIndex((agent) => agent.id === id);
  if (index === -1) return null;

  agents[index] = {
    ...agents[index],
    ...patch,
    updatedAt: now(),
  };

  await writeJsonFile(AGENTS_FILE, agents);
  return agents[index];
}

export async function deleteAgent(id: string): Promise<boolean> {
  const agents = await listAgents();
  const agent = agents.find((entry) => entry.id === id);
  if (!agent || DEFAULT_AGENTS.some((seed) => seed.id === id)) {
    return false;
  }

  const nextAgents = agents.filter((entry) => entry.id !== id);
  await writeJsonFile(AGENTS_FILE, nextAgents);

  const tasks = await listTasks();
  await writeJsonFile(
    TASKS_FILE,
    tasks.filter((task) => task.agentId !== id),
  );

  await deleteDurableJson(`conversations/${id}.json`);

  return true;
}

export async function listTasks(agentId?: string): Promise<Task[]> {
  await ensurePartyPerfectSeed();
  const tasks = normalizeTasks(await readJsonFile<Task[]>(TASKS_FILE, []));
  return agentId ? tasks.filter((task) => task.agentId === agentId) : tasks;
}

export async function getTask(id: string): Promise<Task | null> {
  const tasks = await listTasks();
  return tasks.find((task) => task.id === id) ?? null;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const task: Task = {
    id: createId(),
    agentId: input.agentId,
    title: input.title.trim(),
    description: input.description.trim(),
    status: "todo",
    progress: 0,
    priority: input.priority ?? "medium",
    dueDate: input.dueDate,
    createdAt: now(),
    updatedAt: now(),
  };

  const tasks = await listTasks();
  tasks.unshift(task);
  await writeJsonFile(TASKS_FILE, tasks);
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<Task, "title" | "description" | "status" | "progress" | "result" | "priority" | "dueDate">
  >,
): Promise<Task | null> {
  const tasks = await listTasks();
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return null;

  tasks[index] = {
    ...tasks[index],
    ...patch,
    updatedAt: now(),
  };

  await writeJsonFile(TASKS_FILE, tasks);
  return tasks[index];
}

export async function listInventory(): Promise<InventoryItem[]> {
  const por = await getPorSnapshot();
  if (por?.inventory) {
    const fromPor = inventoryFromPorSnapshot(por);
    if (fromPor.length > 0) return fromPor;
  }
  await ensurePartyPerfectSeed();
  return readJsonFile<InventoryItem[]>(INVENTORY_FILE, []);
}

export async function createInventoryItem(
  input: CreateInventoryInput,
): Promise<InventoryItem> {
  const item: InventoryItem = {
    id: createId(),
    name: input.name.trim(),
    category: input.category.trim(),
    quantity: input.quantity,
    available: input.available,
    pricePerDay: input.pricePerDay,
    status: input.status ?? "available",
    notes: input.notes,
    updatedAt: now(),
  };

  const inventory = await listInventory();
  inventory.unshift(item);
  await writeJsonFile(INVENTORY_FILE, inventory);
  return item;
}

export async function updateInventoryItem(
  id: string,
  patch: Partial<Omit<InventoryItem, "id">>,
): Promise<InventoryItem | null> {
  const inventory = await listInventory();
  const index = inventory.findIndex((item) => item.id === id);
  if (index === -1) return null;

  inventory[index] = {
    ...inventory[index],
    ...patch,
    updatedAt: now(),
  };

  await writeJsonFile(INVENTORY_FILE, inventory);
  return inventory[index];
}

export async function listMarketing(): Promise<MarketingItem[]> {
  await ensurePartyPerfectSeed();
  return readJsonFile<MarketingItem[]>(MARKETING_FILE, []);
}

export async function createMarketingItem(
  input: CreateMarketingInput,
): Promise<MarketingItem> {
  const item: MarketingItem = {
    id: createId(),
    title: input.title.trim(),
    channel: input.channel.trim(),
    content: input.content.trim(),
    status: input.status ?? "draft",
    scheduledDate: input.scheduledDate,
    updatedAt: now(),
  };

  const marketing = await listMarketing();
  marketing.unshift(item);
  await writeJsonFile(MARKETING_FILE, marketing);
  return item;
}

export async function updateMarketingItem(
  id: string,
  patch: Partial<Omit<MarketingItem, "id">>,
): Promise<MarketingItem | null> {
  const marketing = await listMarketing();
  const index = marketing.findIndex((item) => item.id === id);
  if (index === -1) return null;

  marketing[index] = {
    ...marketing[index],
    ...patch,
    updatedAt: now(),
  };

  await writeJsonFile(MARKETING_FILE, marketing);
  return marketing[index];
}

export async function listReports(): Promise<SavedReport[]> {
  await ensurePartyPerfectSeed();
  const reports = await readJsonFile<SavedReport[]>(REPORTS_FILE, []);
  return reports.sort(
    (a, b) =>
      new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
  );
}

export async function createReport(
  input: Omit<SavedReport, "id">,
): Promise<SavedReport> {
  const report: SavedReport = {
    ...input,
    id: createId(),
  };
  const reports = await listReports();
  reports.unshift(report);
  await writeJsonFile(REPORTS_FILE, reports);
  return report;
}

export async function listEmails(accountId?: EmailItem["accountId"]): Promise<EmailItem[]> {
  await ensurePartyPerfectSeed();
  const emails = normalizeEmails(await readJsonFile<EmailItem[]>(EMAILS_FILE, []));
  const filtered = accountId
    ? emails.filter((email) => email.accountId === accountId)
    : emails;
  return filtered.sort(compareEmailsByPriority);
}

/**
 * Merge IMAP-fetched emails into storage.
 * For accounts that synced successfully, drop demo-only rows so live mail is the source of truth.
 * Preserves local status/repliedAt when the same message already exists.
 */
export async function mergeImapEmails(
  incoming: EmailItem[],
  syncedAccountIds: EmailItem["accountId"][],
): Promise<{
  added: number;
  highPriorityNew: EmailItem[];
  addedByAccount: Partial<Record<EmailItem["accountId"], number>>;
}> {
  await ensurePartyPerfectSeed();
  const existing = normalizeEmails(
    await readJsonFile<EmailItem[]>(EMAILS_FILE, []),
  );

  const synced = new Set(syncedAccountIds);
  const kept = existing.filter((email) => {
    if (!synced.has(email.accountId)) return true;
    return email.source === "imap" || Boolean(email.messageId);
  });

  const byKey = new Map<string, EmailItem>();
  for (const email of kept) {
    const key = email.messageId
      ? `${email.accountId}:${email.messageId}`
      : email.id;
    byKey.set(key, email);
  }

  let added = 0;
  const addedByAccount: Partial<Record<EmailItem["accountId"], number>> = {};
  const highPriorityNew: EmailItem[] = [];

  for (const email of incoming) {
    const key = email.messageId
      ? `${email.accountId}:${email.messageId}`
      : email.id;
    const prev = byKey.get(key);

    if (prev) {
      byKey.set(key, {
        ...email,
        id: prev.id,
        status:
          prev.status === "replied" || prev.status === "archived"
            ? prev.status
            : email.status,
        repliedAt: prev.repliedAt,
        priority: prev.priority || email.priority,
        updatedAt: now(),
      });
      continue;
    }

    added += 1;
    addedByAccount[email.accountId] =
      (addedByAccount[email.accountId] ?? 0) + 1;
    byKey.set(key, email);
    if (
      (email.priority === "urgent" || email.priority === "business") &&
      email.status === "unread"
    ) {
      highPriorityNew.push(email);
    }
  }

  const merged = Array.from(byKey.values()).sort(compareEmailsByPriority);
  await writeJsonFileBestEffort(EMAILS_FILE, merged);
  return { added, highPriorityNew, addedByAccount };
}

export async function getEmail(id: string): Promise<EmailItem | null> {
  const emails = await listEmails();
  return emails.find((email) => email.id === id) ?? null;
}

export async function updateEmailItem(
  id: string,
  patch: Partial<Pick<EmailItem, "status" | "priority" | "repliedAt">>,
): Promise<EmailItem | null> {
  const emails = normalizeEmails(await readJsonFile<EmailItem[]>(EMAILS_FILE, []));
  const index = emails.findIndex((email) => email.id === id);
  if (index === -1) return null;

  const repliedAt =
    patch.status === "replied"
      ? patch.repliedAt ?? now()
      : patch.repliedAt ?? emails[index].repliedAt;

  emails[index] = {
    ...emails[index],
    ...patch,
    repliedAt,
    updatedAt: now(),
  };

  await writeJsonFile(EMAILS_FILE, emails);
  return emails[index];
}

export async function getSocialData(): Promise<SocialDataFile> {
  await ensurePartyPerfectSeed();
  return readJsonFile<SocialDataFile>(SOCIAL_FILE, seedSocialData());
}

async function writeSocialData(data: SocialDataFile) {
  await writeJsonFile(SOCIAL_FILE, data);
}

/**
 * Merge Meta Graph posts/comments into storage.
 * Preserves local replied/archived status when the same external comment already exists.
 * When live Meta data arrives, demo-sourced rows are dropped.
 */
export async function mergeMetaSocialData(input: {
  posts: SocialPost[];
  comments: SocialComment[];
}): Promise<{ addedComments: number; unreadHighPriority: SocialComment[] }> {
  await ensurePartyPerfectSeed();
  const existing = await readJsonFile<SocialDataFile>(SOCIAL_FILE, seedSocialData());

  const hasLive = input.posts.length > 0 || input.comments.length > 0;
  const keptPosts = hasLive
    ? existing.posts.filter((post) => post.source === "meta" || Boolean(post.externalId))
    : existing.posts;
  const keptComments = hasLive
    ? existing.comments.filter(
        (comment) => comment.source === "meta" || Boolean(comment.externalId),
      )
    : existing.comments;

  const postsByKey = new Map<string, SocialPost>();
  for (const post of keptPosts) {
    const key = post.externalId
      ? `${post.platform}:${post.externalId}`
      : post.id;
    postsByKey.set(key, post);
  }
  for (const post of input.posts) {
    const key = post.externalId
      ? `${post.platform}:${post.externalId}`
      : post.id;
    const prev = postsByKey.get(key);
    postsByKey.set(key, prev ? { ...post, id: prev.id } : post);
  }

  const commentsByKey = new Map<string, SocialComment>();
  for (const comment of keptComments) {
    const key = comment.externalId
      ? `${comment.platform}:${comment.externalId}`
      : comment.id;
    commentsByKey.set(key, comment);
  }

  let addedComments = 0;
  const unreadHighPriority: SocialComment[] = [];

  for (const comment of input.comments) {
    const key = comment.externalId
      ? `${comment.platform}:${comment.externalId}`
      : comment.id;
    const prev = commentsByKey.get(key);

    if (prev) {
      commentsByKey.set(key, {
        ...comment,
        id: prev.id,
        status:
          prev.status === "replied" || prev.status === "archived"
            ? prev.status
            : prev.status === "read"
              ? "read"
              : comment.status,
        repliedAt: prev.repliedAt,
      });
      continue;
    }

    addedComments += 1;
    commentsByKey.set(key, comment);
    if (comment.status === "unread") {
      unreadHighPriority.push(comment);
    }
  }

  const messages = existing.messages;
  await writeSocialData({
    posts: Array.from(postsByKey.values()),
    comments: Array.from(commentsByKey.values()),
    messages,
  });

  return { addedComments, unreadHighPriority };
}

export async function getSocialComment(
  id: string,
): Promise<SocialComment | null> {
  const data = await getSocialData();
  return data.comments.find((comment) => comment.id === id) ?? null;
}

export async function getSocialMessage(
  id: string,
): Promise<SocialDirectMessage | null> {
  const data = await getSocialData();
  return data.messages.find((message) => message.id === id) ?? null;
}

export async function updateSocialComment(
  id: string,
  patch: Partial<Pick<SocialComment, "status" | "repliedAt">>,
): Promise<SocialComment | null> {
  const data = await getSocialData();
  const index = data.comments.findIndex((comment) => comment.id === id);
  if (index === -1) return null;
  const repliedAt =
    patch.status === "replied"
      ? patch.repliedAt ?? now()
      : patch.repliedAt ?? data.comments[index].repliedAt;
  data.comments[index] = {
    ...data.comments[index],
    ...patch,
    repliedAt,
  };
  await writeSocialData(data);
  return data.comments[index];
}

export async function updateSocialMessage(
  id: string,
  patch: Partial<Pick<SocialDirectMessage, "status" | "repliedAt">>,
): Promise<SocialDirectMessage | null> {
  const data = await getSocialData();
  const index = data.messages.findIndex((message) => message.id === id);
  if (index === -1) return null;
  const repliedAt =
    patch.status === "replied"
      ? patch.repliedAt ?? now()
      : patch.repliedAt ?? data.messages[index].repliedAt;
  data.messages[index] = {
    ...data.messages[index],
    ...patch,
    repliedAt,
  };
  await writeSocialData(data);
  return data.messages[index];
}

export function buildSocialEngagement(
  posts: SocialPost[],
): SocialEngagementSummary[] {
  const platforms: SocialPlatform[] = ["facebook", "instagram"];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return platforms.map((platform) => {
    const platformPosts = posts.filter((post) => post.platform === platform);
    return {
      platform,
      totalLikes: platformPosts.reduce((sum, post) => sum + post.likes, 0),
      totalComments: platformPosts.reduce(
        (sum, post) => sum + post.comments,
        0,
      ),
      totalReach: platformPosts.reduce((sum, post) => sum + post.reach, 0),
      postsThisWeek: platformPosts.filter(
        (post) => new Date(post.publishedAt).getTime() >= weekAgo,
      ).length,
    };
  });
}

export async function listBookkeeping(): Promise<BookkeepingEntry[]> {
  const por = await getPorSnapshot();
  if (por?.money) {
    const fromPor = bookkeepingFromPorSnapshot(por);
    if (fromPor.length > 0) return fromPor;
  }
  await ensurePartyPerfectSeed();
  return readJsonFile<BookkeepingEntry[]>(BOOKKEEPING_FILE, []);
}

export async function createBookkeepingEntry(
  input: CreateBookkeepingInput,
): Promise<BookkeepingEntry> {
  const entry: BookkeepingEntry = {
    id: createId(),
    vendor: input.vendor.trim(),
    description: input.description.trim(),
    amount: input.amount,
    status: input.status ?? "pending",
    dueDate: input.dueDate,
    updatedAt: now(),
  };

  const entries = await listBookkeeping();
  entries.unshift(entry);
  await writeJsonFile(BOOKKEEPING_FILE, entries);
  return entry;
}

export async function getConversation(agentId: string): Promise<Conversation> {
  await ensureDataDir();
  const filePath = path.join(CONVERSATIONS_DIR, `${agentId}.json`);
  return readJsonFile<Conversation>(filePath, {
    agentId,
    messages: [],
    updatedAt: now(),
  });
}

export async function appendMessages(
  agentId: string,
  messages: Message[],
): Promise<Conversation> {
  const conversation = await getConversation(agentId);
  conversation.messages.push(...messages);
  conversation.updatedAt = now();

  await writeJsonFile(
    path.join(CONVERSATIONS_DIR, `${agentId}.json`),
    conversation,
  );

  return conversation;
}

export async function replaceLastAssistantMessage(
  agentId: string,
  messageId: string,
  content: string,
): Promise<Conversation> {
  const conversation = await getConversation(agentId);
  const index = conversation.messages.findIndex(
    (message) => message.id === messageId,
  );

  if (index !== -1) {
    conversation.messages[index] = {
      ...conversation.messages[index],
      content,
    };
    conversation.updatedAt = now();
    await writeJsonFile(
      path.join(CONVERSATIONS_DIR, `${agentId}.json`),
      conversation,
    );
  }

  return conversation;
}

export async function listAllConversations(): Promise<Conversation[]> {
  const keys = await listDurableKeys("conversations/");
  return Promise.all(
    keys
      .filter((key) => key.endsWith(".json"))
      .map(async (key) => {
        const agentId = path.basename(key, ".json");
        return readDurableJson<Conversation>(key, {
          agentId,
          messages: [],
          updatedAt: now(),
        });
      }),
  );
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    agents,
    tasks,
    inventory,
    marketing,
    emails,
    social,
    bookkeeping,
    por,
  ] = await Promise.all([
    listAgents(),
    listTasks(),
    listInventory(),
    listMarketing(),
    listEmails(),
    getSocialData(),
    listBookkeeping(),
    getPorSnapshot(),
  ]);

  const socialUnread =
    social.comments.filter((item) => item.status === "unread").length +
    social.messages.filter((item) => item.status === "unread").length;

  const socialNeedsReply = social.comments.filter(
    (item) => item.status !== "replied" && item.status !== "archived",
  ).length;

  const porMeta = getPorSyncMeta(por);

  return {
    agentCount: agents.length,
    tasksTodo: tasks.filter((task) => task.status === "todo").length,
    tasksInProgress: tasks.filter((task) => task.status === "in_progress")
      .length,
    tasksDone: tasks.filter((task) => task.status === "done").length,
    inventoryLow: inventory.filter(
      (item) => item.available / Math.max(item.quantity, 1) < 0.25,
    ).length,
    marketingScheduled: marketing.filter((item) => item.status === "scheduled")
      .length,
    emailsUnread: emails.filter((item) => item.status === "unread").length,
    emailsNeedsReply: emails.filter((item) => needsReplyEmail(item.status))
      .length,
    emailsBusinessPriority: emails.filter(
      (item) =>
        item.status !== "archived" &&
        (item.priority === "urgent" || item.priority === "business"),
    ).length,
    socialUnread,
    socialNeedsReply,
    bookkeepingPending: bookkeeping.filter(
      (item) => item.status === "pending" || item.status === "overdue",
    ).length,
    por: {
      syncedAt: porMeta.syncedAt,
      stale: porMeta.stale,
      arOpenBalance: por?.money.arOpenBalance ?? null,
      openContracts: por?.ops.openContracts ?? null,
      deliveriesToday: por?.ops.deliveriesToday ?? null,
      returnsDueToday: por?.ops.returnsDueToday ?? null,
      inventoryAvailable: por ? porInventoryTotals(por).availableQuantity : null,
      inventoryOut: por ? porInventoryTotals(por).outQuantity : null,
      paymentsLast24hVolume: por?.money.paymentsLast24h.volume ?? null,
    },
  };
}

export async function loadDashboardExport() {
  const [agents, tasks, conversations, inventory, marketing, emails, bookkeeping] =
    await Promise.all([
      listAgents(),
      listTasks(),
      listAllConversations(),
      listInventory(),
      listMarketing(),
      listEmails(),
      listBookkeeping(),
    ]);

  return {
    exportedAt: now(),
    company: "Party Perfect Event Rentals",
    agents,
    tasks,
    conversations,
    inventory,
    marketing,
    emails,
    bookkeeping,
  };
}
