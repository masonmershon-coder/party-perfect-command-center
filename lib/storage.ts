import { promises as fs } from "fs";
import path from "path";
import { getDataDir } from "./data-dir";
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

async function ensureDataDir() {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath: string, data: unknown) {
  await ensureDataDir();
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
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
    await writeJsonFile(AGENTS_FILE, agents);

    for (const agent of agents) {
      await writeJsonFile(path.join(CONVERSATIONS_DIR, `${agent.id}.json`), {
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
        await writeJsonFile(path.join(CONVERSATIONS_DIR, `${seed.id}.json`), {
          agentId: seed.id,
          messages: [],
          updatedAt: timestamp,
        } satisfies Conversation);
      }
    }

    if (changed) {
      await writeJsonFile(AGENTS_FILE, mergedAgents);
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
      await writeJsonFile(AGENTS_FILE, syncedAgents);
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
    await writeJsonFile(TASKS_FILE, tasks);
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
    await writeJsonFile(INVENTORY_FILE, inventory);
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
    await writeJsonFile(MARKETING_FILE, marketing);
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
    await writeJsonFile(EMAILS_FILE, emails);
  }

  const existingSocial = await readJsonFile<SocialDataFile | null>(
    SOCIAL_FILE,
    null,
  );
  if (!existingSocial?.posts?.length) {
    await writeJsonFile(SOCIAL_FILE, seedSocialData());
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
    await writeJsonFile(BOOKKEEPING_FILE, bookkeeping);
  }

  const existingReports = await readJsonFile<SavedReport[]>(REPORTS_FILE, []);
  if (existingReports.length === 0) {
    const reports: SavedReport[] = DEFAULT_REPORTS.map((item) => ({
      ...item,
      id: createId(),
    }));
    await writeJsonFile(REPORTS_FILE, reports);
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

  try {
    await fs.unlink(path.join(CONVERSATIONS_DIR, `${id}.json`));
  } catch {
    // ignore
  }

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
  await ensureDataDir();

  try {
    const files = await fs.readdir(CONVERSATIONS_DIR);
    const conversations = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) =>
          readJsonFile<Conversation>(path.join(CONVERSATIONS_DIR, file), {
            agentId: file.replace(".json", ""),
            messages: [],
            updatedAt: now(),
          }),
        ),
    );

    return conversations;
  } catch {
    return [];
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [agents, tasks, inventory, marketing, emails, social, bookkeeping] =
    await Promise.all([
      listAgents(),
      listTasks(),
      listInventory(),
      listMarketing(),
      listEmails(),
      getSocialData(),
      listBookkeeping(),
    ]);

  const socialUnread =
    social.comments.filter((item) => item.status === "unread").length +
    social.messages.filter((item) => item.status === "unread").length;

  const socialNeedsReply = social.comments.filter(
    (item) => item.status !== "replied" && item.status !== "archived",
  ).length;

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
    bookkeepingPending: bookkeeping.filter((item) => item.status === "pending")
      .length,
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
