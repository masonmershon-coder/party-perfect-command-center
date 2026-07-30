export type AgentStatus = "idle" | "working" | "completed" | "error";

export type GrokModel = "grok-4.3" | "grok-build-0.1";

export type TaskStatus = "todo" | "in_progress" | "done";

export type MessageRole = "user" | "assistant" | "system";

export type NavSection =
  | "dashboard"
  | "agents"
  | "tasks"
  | "inventory"
  | "emails"
  | "social"
  | "bookkeeping"
  | "marketing"
  | "reports"
  | "hiring"
  | "chat";

export type InventoryStatus = "available" | "reserved" | "maintenance";

export type MarketingStatus = "draft" | "scheduled" | "published";

export type EmailAccountId = "company" | "josh" | "michelle";

export type InboxEmailStatus = "unread" | "read" | "replied" | "archived";

export type EmailPriority = "urgent" | "business" | "general" | "low";

/** @deprecated Use InboxEmailStatus for inbox emails */
export type EmailStatus = "draft" | "sent" | "scheduled";

export type SocialPlatform = "facebook" | "instagram";

export type ConnectionType = "email" | "social";

export type SocialInteractionStatus = "unread" | "read" | "replied" | "archived";

export type BookkeepingStatus = "pending" | "paid" | "overdue";

export interface Agent {
  id: string;
  slug: string;
  name: string;
  description: string;
  goal: string;
  status: AgentStatus;
  model: GrokModel;
  icon: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  agentId: string;
  title: string;
  description: string;
  status: TaskStatus;
  progress: number;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  taskId?: string;
  createdAt: string;
}

export interface Conversation {
  agentId: string;
  messages: Message[];
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  available: number;
  pricePerDay: number;
  status: InventoryStatus;
  notes?: string;
  updatedAt: string;
}

export interface MarketingItem {
  id: string;
  title: string;
  channel: string;
  status: MarketingStatus;
  content: string;
  scheduledDate?: string;
  updatedAt: string;
}

export interface EmailItem {
  id: string;
  accountId: EmailAccountId;
  subject: string;
  sender: string;
  senderEmail: string;
  preview: string;
  body: string;
  receivedAt: string;
  status: InboxEmailStatus;
  priority: EmailPriority;
  repliedAt?: string;
  updatedAt: string;
  /** IMAP Message-ID when synced from GoDaddy */
  messageId?: string;
  source?: "demo" | "imap";
}

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  caption: string;
  publishedAt: string;
  likes: number;
  comments: number;
  reach: number;
  status: "published" | "scheduled";
  externalId?: string;
  source?: "demo" | "meta";
  permalink?: string;
}

export interface SocialComment {
  id: string;
  postId: string;
  platform: SocialPlatform;
  author: string;
  authorHandle: string;
  text: string;
  createdAt: string;
  status: SocialInteractionStatus;
  repliedAt?: string;
  externalId?: string;
  source?: "demo" | "meta";
}

export interface SocialDirectMessage {
  id: string;
  platform: SocialPlatform;
  sender: string;
  senderHandle: string;
  preview: string;
  body: string;
  receivedAt: string;
  status: SocialInteractionStatus;
  repliedAt?: string;
}

export interface SocialEngagementSummary {
  platform: SocialPlatform;
  totalLikes: number;
  totalComments: number;
  totalReach: number;
  postsThisWeek: number;
}

export interface SanitizedConnection {
  id: string;
  type: ConnectionType;
  accountKey: string;
  label: string;
  connectedAt: string;
  sessionToken: string;
  expiresAt?: string;
  hasOAuthToken?: boolean;
}

export type CatchUpItemType = "email" | "social_comment";

export type CatchUpPriority = "high" | "medium" | "low";

export interface CatchUpItem {
  id: string;
  type: CatchUpItemType;
  title: string;
  preview: string;
  source: string;
  date: string;
  priority: CatchUpPriority;
  accountId?: EmailAccountId;
  platform?: SocialPlatform;
  status: string;
  grokNote?: string;
}

export interface CatchUpResult {
  totalCount: number;
  emailCount: number;
  socialCount: number;
  summary: string;
  grokInsights: string;
  items: CatchUpItem[];
  lookbackMonths: number;
}

export interface LiveSnapshot {
  checkedAt: string;
  agent: string;
  emails: {
    unreadIds: string[];
    unreadCount: number;
    needsReplyCount: number;
  };
  social: {
    unreadCommentIds: string[];
    fbUnreadCommentIds: string[];
    igUnreadCommentIds: string[];
    unreadCommentCount: number;
    unreadMessageCount: number;
    needsReplyCount: number;
  };
  tasks: {
    todoCount: number;
    inProgressCount: number;
  };
}

export type LiveNotificationKind = "emails" | "facebook" | "instagram" | "tasks";

export interface LiveNotification {
  id: string;
  kind: LiveNotificationKind;
  count: number;
  message: string;
  createdAt: string;
}

export type ReportType = "weekly-recap" | "ops-summary";

export interface SavedReport {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  generatedAt: string;
  sentViaSms?: boolean;
  twilioSid?: string;
  generatedBy: "mike-operations" | "system";
}

export interface BookkeepingEntry {
  id: string;
  vendor: string;
  description: string;
  amount: number;
  status: BookkeepingStatus;
  dueDate?: string;
  updatedAt: string;
}

export interface DashboardExport {
  exportedAt: string;
  company: string;
  agents: Agent[];
  tasks: Task[];
  conversations: Conversation[];
  inventory: InventoryItem[];
  marketing: MarketingItem[];
  emails: EmailItem[];
  bookkeeping: BookkeepingEntry[];
}

export interface CreateAgentInput {
  name: string;
  goal: string;
  description?: string;
  model?: GrokModel;
  icon?: string;
}

export interface CreateTaskInput {
  agentId: string;
  title: string;
  description: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
}

export interface CreateInventoryInput {
  name: string;
  category: string;
  quantity: number;
  available: number;
  pricePerDay: number;
  status?: InventoryStatus;
  notes?: string;
}

export interface CreateMarketingInput {
  title: string;
  channel: string;
  content: string;
  status?: MarketingStatus;
  scheduledDate?: string;
}

export interface UpdateEmailInput {
  status?: InboxEmailStatus;
  priority?: EmailPriority;
}

export interface DraftEmailReplyInput {
  instructions?: string;
  tone?: "professional" | "friendly" | "concise";
}

export interface CreateBookkeepingInput {
  vendor: string;
  description: string;
  amount: number;
  status?: BookkeepingStatus;
  dueDate?: string;
}

export interface GitHubExportInput {
  repo?: string;
  branch?: string;
  message?: string;
}

export interface PorInventoryCategory {
  name: string;
  itemCount: number;
  quantity: number;
  available: number;
}

export interface PorInventoryItemSnapshot {
  id: string;
  name: string;
  category: string;
  quantity: number;
  available: number;
  pricePerDay?: number;
  status: InventoryStatus;
  notes?: string;
}

export interface PorMoneySnapshot {
  arOpenBalance: number;
  arCustomerCount: number;
  aging: {
    current: number;
    days30: number;
    days60: number;
    days90: number;
    days120Plus: number;
  };
  paymentsLast24h: {
    count: number;
    volume: number;
  };
}

export interface PorOpsSnapshot {
  openContracts: number;
  deliveriesToday: number;
  returnsDueToday: number;
}

/** Read-only Point of Rental ops snapshot pushed from ENTERPRISE. */
export interface PorSnapshot {
  version: 1;
  syncedAt: string;
  sourceHost: string;
  sourceDatabase: string;
  inventory: {
    totalItems: number;
    totalQuantity: number;
    availableQuantity: number;
    outQuantity: number;
    categories: PorInventoryCategory[];
    items?: PorInventoryItemSnapshot[];
  };
  money: PorMoneySnapshot;
  ops: PorOpsSnapshot;
}

export interface PorSyncMeta {
  present: boolean;
  stale: boolean;
  syncedAt: string | null;
  ageMs: number | null;
  sourceHost: string | null;
}

export interface DashboardStats {
  agentCount: number;
  tasksTodo: number;
  tasksInProgress: number;
  tasksDone: number;
  inventoryLow: number;
  marketingScheduled: number;
  emailsUnread: number;
  emailsNeedsReply: number;
  emailsBusinessPriority: number;
  socialUnread: number;
  socialNeedsReply: number;
  bookkeepingPending: number;
  /** Live POR mirror fields (null when no snapshot yet). */
  por?: {
    syncedAt: string | null;
    stale: boolean;
    arOpenBalance: number | null;
    openContracts: number | null;
    deliveriesToday: number | null;
    returnsDueToday: number | null;
    inventoryAvailable: number | null;
    inventoryOut: number | null;
    paymentsLast24hVolume: number | null;
  };
}
