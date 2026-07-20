import type { AgentStatus, InboxEmailStatus, TaskStatus } from "@/lib/types";
import {
  agentStatusStyles,
  bookkeepingStatusStyles,
  formatStatus,
  inboxEmailStatusLabels,
  inboxEmailStatusStyles,
  inventoryStatusStyles,
  marketingStatusStyles,
  taskStatusLabels,
  taskStatusStyles,
} from "@/lib/ui";

export function StatusBadge({
  status,
  kind = "agent",
}: {
  status: AgentStatus | TaskStatus | string;
  kind?: "agent" | "task" | "inventory" | "marketing" | "email" | "inbox" | "bookkeeping";
}) {
  const styles =
    kind === "task"
      ? taskStatusStyles[status as TaskStatus] ?? taskStatusStyles.todo
      : kind === "inventory"
        ? inventoryStatusStyles[status as keyof typeof inventoryStatusStyles] ??
          inventoryStatusStyles.available
        : kind === "marketing"
          ? marketingStatusStyles[
              status as keyof typeof marketingStatusStyles
            ] ?? marketingStatusStyles.draft
          : kind === "email" || kind === "inbox"
            ? inboxEmailStatusStyles[status as InboxEmailStatus] ??
              inboxEmailStatusStyles.read
            : kind === "bookkeeping"
              ? bookkeepingStatusStyles[
                  status as keyof typeof bookkeepingStatusStyles
                ] ?? bookkeepingStatusStyles.pending
              : agentStatusStyles[status as AgentStatus] ?? agentStatusStyles.idle;

  const label =
    kind === "task"
      ? taskStatusLabels[status as TaskStatus] ?? formatStatus(status)
      : kind === "inbox" || kind === "email"
        ? inboxEmailStatusLabels[status as InboxEmailStatus] ??
          formatStatus(status)
        : formatStatus(status);

  return <span className={styles}>{label}</span>;
}
