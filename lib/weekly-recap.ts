import { gatherCatchUpItems } from "./catch-up";
import { assertGrokConfigured, grokClient } from "./grok";
import { getPorSnapshot, getPorSyncMeta } from "./por-snapshot";
import { getDashboardStats, listInventory, listTasks } from "./storage";
import type { Task } from "./types";

const MAX_RECAP_CHARS = 320;

function formatTaskLine(task: Task) {
  return `${task.title} (${task.status.replace("_", " ")})`;
}

export async function buildWeeklyRecapContext() {
  const [stats, tasks, catchUpItems, inventory, por] = await Promise.all([
    getDashboardStats(),
    listTasks(),
    gatherCatchUpItems(),
    listInventory(),
    getPorSnapshot(),
  ]);

  const lowStock = inventory
    .filter((item) => item.available / Math.max(item.quantity, 1) < 0.25)
    .slice(0, 4)
    .map((item) => `${item.name} (${item.available}/${item.quantity} available)`);

  const inProgressTasks = tasks
    .filter((task) => task.status === "in_progress")
    .slice(0, 4);
  const highPriorityTodos = tasks
    .filter((task) => task.status === "todo" && task.priority === "high")
    .slice(0, 4);
  const topCatchUp = catchUpItems.slice(0, 5).map((item) => ({
    type: item.type,
    title: item.title,
    priority: item.priority,
    source: item.source,
  }));
  const porMeta = getPorSyncMeta(por);

  return {
    company: "Party Perfect Event Rentals",
    location: "Tulsa, Oklahoma",
    generatedAt: new Date().toISOString(),
    stats,
    inProgressTasks: inProgressTasks.map(formatTaskLine),
    highPriorityTodos: highPriorityTodos.map(formatTaskLine),
    outstandingCount: catchUpItems.length,
    topCatchUp,
    inventoryLowCount: stats.inventoryLow,
    lowStockItems: lowStock,
    por: por
      ? {
          stale: porMeta.stale,
          syncedAt: por.syncedAt,
          arOpenBalance: por.money.arOpenBalance,
          openContracts: por.ops.openContracts,
          deliveriesToday: por.ops.deliveriesToday,
          returnsDueToday: por.ops.returnsDueToday,
          inventoryOut: por.inventory.outQuantity,
          paymentsLast24h: por.money.paymentsLast24h,
        }
      : null,
  };
}

export function fallbackWeeklyRecap(
  context: Awaited<ReturnType<typeof buildWeeklyRecapContext>>,
) {
  const { stats, outstandingCount, inProgressTasks, highPriorityTodos } =
    context;

  const lines = [
    "Party Perfect weekly recap:",
    `${stats.emailsNeedsReply} emails need reply, ${stats.socialNeedsReply} social comments waiting.`,
    `${stats.tasksInProgress} tasks in progress, ${stats.tasksTodo} to do.`,
    `${stats.inventoryLow} inventory items low, ${outstandingCount} Catch Up items.`,
  ];

  if (context.por) {
    lines.push(
      `POR AR $${context.por.arOpenBalance.toFixed(0)}, ${context.por.deliveriesToday} deliveries, ${context.por.returnsDueToday} returns due.`,
    );
  }

  if (highPriorityTodos[0]) {
    lines.push(`Priority: ${highPriorityTodos[0]}`);
  } else if (inProgressTasks[0]) {
    lines.push(`In progress: ${inProgressTasks[0]}`);
  }

  return lines.join(" ").slice(0, MAX_RECAP_CHARS);
}

export async function generateWeeklyRecapMessage() {
  const context = await buildWeeklyRecapContext();
  let recap = fallbackWeeklyRecap(context);

  try {
    assertGrokConfigured();
    const response = await grokClient.responses.create({
      model: "grok-build-0.1",
      input: [
        {
          role: "system",
          content: [
            "You write concise SMS weekly operations recaps for Party Perfect Event Rentals in Tulsa.",
            `Keep the entire message under ${MAX_RECAP_CHARS} characters — plain text, no markdown.`,
            "Include: inbox/social counts, tasks, inventory alerts if any, top priority, and one next action.",
            "Start with 'Party Perfect Weekly:' and use only facts from the provided data.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify(context, null, 2),
        },
      ],
      stream: false,
    });

    const text =
      typeof response.output_text === "string" ? response.output_text.trim() : "";

    if (text) {
      recap = text.slice(0, MAX_RECAP_CHARS);
    }
  } catch {
    // fallback recap already set
  }

  return recap;
}
