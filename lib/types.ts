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
  | "design"
  | "quoting"
  | "bookkeeping"
  | "marketing"
  | "reports"
  | "hiring"
  | "chat";

export type DesignAspectRatio =
  | "1:1"
  | "4:3"
  | "3:4"
  | "16:9"
  | "9:16"
  | "auto";

export type DesignAssetKind = "upload" | "generated";

/** Catalog / POR item Madison used or matched for sales close. */
export interface DesignMatchedItem {
  key: string;
  name: string;
  imageUrl?: string;
  pageUrl?: string;
  categoryName?: string;
  /** POR inventory id when fuzzy/exact match succeeds */
  porItemId?: string;
  porAvailable?: number;
  porPricePerDay?: number;
  source: "website" | "por" | "both";
  score?: number;
}

export interface DesignAsset {
  id: string;
  kind: DesignAssetKind;
  /** image/jpeg, image/png, video/mp4, etc. */
  mimeType: string;
  /** Browser URL: `/api/design/media/:id`, data URI, or legacy public Blob URL */
  url: string;
  /** Private Vercel Blob pathname when stored in Blob (store is private-access). */
  blobPathname?: string;
  fileName: string;
  prompt?: string;
  aspectRatio?: DesignAspectRatio;
  createdAt: string;
  createdBy?: string;
  sourceAssetId?: string;
  /** Extra source asset ids when merging multiple photos */
  sourceAssetIds?: string[];
  /** Website/POR items used as references or auto-matched for the quote */
  matchedItems?: DesignMatchedItem[];
  /** Which media engine Madison used (Flux, Grok Imagine, etc.) */
  generatorId?: string;
  generatorLabel?: string;
  generatorReason?: string;
}

export interface DesignStudioState {
  assets: DesignAsset[];
  updatedAt: string;
}

/** Public website rental catalog (partyperfecteventrental.com itemimages). */
export interface WebsiteCatalogItem {
  key: string;
  name: string;
  categoryId: string;
  categoryName: string;
  /** Absolute URL to product photo (itemimages/…). */
  imageUrl: string;
  pageUrl: string;
  /** Numeric id from itemimages/{id}.jpg when present */
  imageId?: string;
}

export interface WebsiteCatalogState {
  items: WebsiteCatalogItem[];
  syncedAt: string;
  source: string;
  categoryCount: number;
}

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

/** Quote / reservation pipeline + catalog for showroom ticket completion. */
export interface PorSalesCatalogItem {
  id: string;
  name: string;
  category: string;
  available: number;
  quantity: number;
  pricePerDay: number;
  kind: "product" | "service";
}

export interface PorSalesSnapshot {
  openQuotes: number;
  openReservations: number;
  /** Quotes with event begin date in the next 14 days (deposit chase). */
  quotesEventWithin14Days: number;
  /** Service-like SKUs (delivery, flip, linen bag, labor). */
  serviceItems: PorSalesCatalogItem[];
  /** Broader catalog sample for completing tickets (rates + availability). */
  catalogItems: PorSalesCatalogItem[];
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
  /** Optional — older agents omit until ENTERPRISE script is updated. */
  sales?: PorSalesSnapshot;
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

/**
 * Full POR item catalog (all active SKUs from the ItemFile export) — the complete
 * inventory Madison matches against, beyond the ~300-item live snapshot sample.
 */
export interface PorCatalogItem {
  /** POR ItemFile [KEY] */
  sku: string;
  name: string;
  /** POR numeric category code */
  categoryCode?: string;
  /** Decoded category name; "" when unknown */
  category?: string;
  /** POR ItemFile.NUM — the id reservations link by (availability) */
  num?: string;
  ratePerDay: number;
  qty: number;
  available: number;
}

export interface PorCatalogState {
  items: PorCatalogItem[];
  activeItems: number;
  source: string;
  syncedAt: string;
}

/** A single line to price in a quote (rental product or service/fee). */
export interface QuoteLineInput {
  qty: number;
  description: string;
  unitRate: number;
  porItemName?: string;
  porItemId?: string;
  category?: string;
  size?: string;
  color?: string;
  kind?: "product" | "service";
}

export interface QuoteLine extends QuoteLineInput {
  kind: "product" | "service";
  lineTotal: number;
  lineNote?: string;
}

export interface QuoteTotals {
  productSubtotal: number;
  serviceSubtotal: number;
  subtotal: number;
  salesTax: number;
  damageWaiver: number;
  total: number;
  deposit: number;
}

export interface Quote {
  productLines: QuoteLine[];
  serviceLines: QuoteLine[];
  totals: QuoteTotals;
  notes: string[];
}

export type QuoteQueueStatus = "draft" | "reviewed" | "sent";

/** Customer + event fields from the paper Rental Proposal form. */
export interface QuoteCustomerEvent {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress?: string;
  /** YYYY-MM-DD — drives availability check */
  eventDate: string;
  eventStartTime: string;
  fulfillment: "pickup" | "delivery";
  deliveryAddress?: string;
  locationType?: string;
  venue?: string;
  guestCount?: string;
  themeColors?: string;
  salesRep?: string;
  notes?: string;
}

/** Shared showroom quote queue (durable Redis/local). */
export interface SavedQuote {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: QuoteQueueStatus;
  customer: QuoteCustomerEvent;
  quote: Quote;
  emailDraft: string;
  ticketText: string;
}

export interface QuoteAvailabilityLineResult {
  itemKey: string;
  total: number;
  firmHeld: number;
  softHeld: number;
  available: number;
  requested: number;
  overbooked: boolean;
  tight: boolean;
}

/** A POR reservation line (from Transactions + TransactionItems) for availability. */
export interface PorReservation {
  itemKey: string;
  qty: number;
  /** ISO date the item goes out */
  delivery: string;
  /** ISO date the item comes back */
  pickup: string;
  status: string;
  /** true = firm hold (Reservation/Order) counts against availability; false = soft quote */
  firm: boolean;
}

export interface PorReservationState {
  reservations: PorReservation[];
  syncedAt: string;
  source: string;
}
