import type {
  AgentStatus,
  BookkeepingStatus,
  EmailStatus,
  GrokModel,
  InventoryStatus,
  MarketingStatus,
  NavSection,
  TaskStatus,
} from "./types";

export const navItems: {
  id: NavSection;
  label: string;
  icon: string;
  ownerOnly?: boolean;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "agents", label: "Agents", icon: "◎" },
  { id: "tasks", label: "Tasks", icon: "☑" },
  { id: "emails", label: "Emails", icon: "✉" },
  { id: "social", label: "Social Media", icon: "✦" },
  { id: "design", label: "Design Studio", icon: "◐" },
  { id: "quoting", label: "Quoting", icon: "◇" },
  { id: "inventory", label: "Inventory", icon: "▣" },
  { id: "bookkeeping", label: "Bookkeeping", icon: "◈", ownerOnly: true },
  { id: "marketing", label: "Marketing / Ads", icon: "◉", ownerOnly: true },
  { id: "hiring", label: "Hiring", icon: "✎" },
  { id: "reports", label: "Reports", icon: "▤", ownerOnly: true },
];

const badgeBase =
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider";

export const agentStatusStyles: Record<AgentStatus, string> = {
  idle: `${badgeBase} border-[var(--pp-border)] bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]`,
  working: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  completed: `${badgeBase} border-emerald-500/30 bg-emerald-500/10 text-emerald-600`,
  error: `${badgeBase} border-red-500/30 bg-red-500/10 text-red-500`,
};

export const taskStatusStyles: Record<TaskStatus, string> = {
  todo: `${badgeBase} border-[var(--pp-border)] bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]`,
  in_progress: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  done: `${badgeBase} border-emerald-500/30 bg-emerald-500/10 text-emerald-600`,
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const inventoryStatusStyles: Record<InventoryStatus, string> = {
  available: `${badgeBase} border-emerald-500/30 bg-emerald-500/10 text-emerald-600`,
  reserved: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  maintenance: `${badgeBase} border-amber-500/30 bg-amber-500/10 text-amber-600`,
};

export const marketingStatusStyles: Record<MarketingStatus, string> = {
  draft: `${badgeBase} border-[var(--pp-border)] bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]`,
  scheduled: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  published: `${badgeBase} border-emerald-500/30 bg-emerald-500/10 text-emerald-600`,
};

export const inboxEmailStatusStyles: Record<
  import("./types").InboxEmailStatus,
  string
> = {
  unread: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  read: `${badgeBase} border-[var(--pp-border)] bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]`,
  replied: `${badgeBase} border-emerald-500/40 bg-emerald-500/10 text-emerald-600`,
  archived: `${badgeBase} border-slate-500/30 bg-slate-500/10 text-slate-500`,
};

export const inboxEmailStatusLabels: Record<
  import("./types").InboxEmailStatus,
  string
> = {
  unread: "Unread",
  read: "Read",
  replied: "Replied",
  archived: "Archived",
};

export const socialInteractionStatusStyles: Record<
  import("./types").SocialInteractionStatus,
  string
> = {
  unread: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  read: `${badgeBase} border-[var(--pp-border)] bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]`,
  replied: `${badgeBase} border-emerald-500/40 bg-emerald-500/10 text-emerald-600`,
  archived: `${badgeBase} border-slate-500/30 bg-slate-500/10 text-slate-500`,
};

export const emailPriorityStyles: Record<
  import("./types").EmailPriority,
  string
> = {
  urgent: `${badgeBase} border-red-500/40 bg-red-500/10 text-red-600`,
  business: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  general: `${badgeBase} border-[var(--pp-border)] bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]`,
  low: `${badgeBase} border-slate-500/30 bg-slate-500/10 text-slate-500`,
};

export const emailPriorityLabels: Record<
  import("./types").EmailPriority,
  string
> = {
  urgent: "Urgent",
  business: "Business",
  general: "General",
  low: "Low",
};

/** @deprecated Outbound campaign statuses */
export const emailStatusStyles: Record<EmailStatus, string> = {
  draft: `${badgeBase} border-[var(--pp-border)] bg-[var(--pp-accent-muted)] text-[var(--pp-text-muted)]`,
  scheduled: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  sent: `${badgeBase} border-emerald-500/30 bg-emerald-500/10 text-emerald-600`,
};

export const bookkeepingStatusStyles: Record<BookkeepingStatus, string> = {
  pending: `${badgeBase} border-[var(--pp-accent)] bg-[var(--pp-accent-soft)] text-[var(--pp-accent)]`,
  paid: `${badgeBase} border-emerald-500/30 bg-emerald-500/10 text-emerald-600`,
  overdue: `${badgeBase} border-red-500/30 bg-red-500/10 text-red-500`,
};

export const modelOptions: { value: GrokModel; label: string }[] = [
  { value: "grok-build-0.1", label: "Grok Build 0.1 (cost efficient)" },
  { value: "grok-4.3", label: "Grok 4.3 (advanced)" },
];

export function formatStatus(status: string) {
  return taskStatusLabels[status as TaskStatus] ?? status.replaceAll("_", " ");
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}
