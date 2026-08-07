import { gatherCatchUpItems } from "./catch-up";
import { assertGrokConfigured, grokClient } from "./grok";
import { listJobApplications } from "./job-applications";
import { getPorSnapshot, getPorSyncMeta } from "./por-snapshot";
import { getDashboardStats, listInventory, listTasks } from "./storage";
import type { Task } from "./types";

const MAX_RECAP_CHARS = 320;

function formatTaskLine(task: Task) {
  return `${task.title} (${task.status.replace("_", " ")})`;
}

export async function buildWeeklyRecapContext() {
  const [stats, tasks, catchUpItems, inventory, por, apps] = await Promise.all([
    getDashboardStats(),
    listTasks(),
    gatherCatchUpItems(),
    listInventory(),
    getPorSnapshot(),
    listJobApplications().catch(() => []),
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

  const flagged = apps
    .filter((a) => a.mike.flagForJosh)
    .sort((a, b) => b.mike.score - a.mike.score);
  const topApps = [...apps]
    .sort((a, b) => b.mike.score - a.mike.score)
    .slice(0, 5)
    .map((a) => ({
      name: a.fullName,
      score: a.mike.score,
      fit: a.mike.primaryFit,
      flagged: a.mike.flagForJosh,
      phone: a.phone,
    }));

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
    hiring: {
      total: apps.length,
      flagged: flagged.length,
      top: topApps,
    },
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

  if (context.hiring.total > 0) {
    lines.push(
      `Hiring: ${context.hiring.total} apps, ${context.hiring.flagged} flagged for Josh.`,
    );
  }

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

export function fallbackWeeklyRecapEmail(
  context: Awaited<ReturnType<typeof buildWeeklyRecapContext>>,
) {
  const lines = [
    "Party Perfect — Monday weekly ops recap (Mike)",
    "",
    `Inbox needing reply: ${context.stats.emailsNeedsReply}`,
    `Social needing reply: ${context.stats.socialNeedsReply}`,
    `Tasks in progress: ${context.stats.tasksInProgress} · todo: ${context.stats.tasksTodo}`,
    `Catch Up items: ${context.outstandingCount}`,
    `Inventory low: ${context.inventoryLowCount}`,
    "",
  ];

  if (context.hiring.total > 0) {
    lines.push(
      `Hiring queue: ${context.hiring.total} applications · ${context.hiring.flagged} flagged for Josh`,
    );
    for (const a of context.hiring.top) {
      lines.push(
        `  • ${a.name} — ${a.score}${a.flagged ? " FLAGGED" : ""} · ${a.fit} · ${a.phone}`,
      );
    }
    lines.push("");
  }

  if (context.highPriorityTodos.length) {
    lines.push("High-priority todos:");
    for (const t of context.highPriorityTodos) lines.push(`  • ${t}`);
    lines.push("");
  }

  if (context.inProgressTasks.length) {
    lines.push("In progress:");
    for (const t of context.inProgressTasks) lines.push(`  • ${t}`);
    lines.push("");
  }

  if (context.lowStockItems.length) {
    lines.push("Low stock:");
    for (const item of context.lowStockItems) lines.push(`  • ${item}`);
    lines.push("");
  }

  if (context.topCatchUp.length) {
    lines.push("Top Catch Up:");
    for (const item of context.topCatchUp) {
      lines.push(`  • [${item.priority}] ${item.title} (${item.type})`);
    }
    lines.push("");
  }

  if (context.por) {
    lines.push(
      `POR sync: ${context.por.stale ? "STALE" : "fresh"} @ ${context.por.syncedAt}`,
      `Open contracts: ${context.por.openContracts} · Deliveries today: ${context.por.deliveriesToday} · Returns due: ${context.por.returnsDueToday}`,
      `(Money figures available in Owner mode on Command Center.)`,
      "",
    );
  }

  lines.push("Next: clear Catch Up + call flagged applicants.");
  lines.push("Mike · Operations Manager");
  return lines.join("\n");
}

export async function generateWeeklyRecapMessage() {
  const context = await buildWeeklyRecapContext();
  let recap = fallbackWeeklyRecap(context);

  try {
    assertGrokConfigured();
    const response = await grokClient.responses.create({
      model: "grok-4.3",
      input: [
        {
          role: "system",
          content: [
            "You write concise SMS weekly operations recaps for Party Perfect Event Rentals in Tulsa.",
            `Keep the entire message under ${MAX_RECAP_CHARS} characters — plain text, no markdown.`,
            "Include: inbox/social counts, tasks, hiring flags if any, inventory alerts if any, top priority, and one next action.",
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

/** Longer plain-text recap for Monday email to Josh (info@mershonevents.com). */
export async function generateWeeklyRecapEmailBody() {
  const context = await buildWeeklyRecapContext();
  let body = fallbackWeeklyRecapEmail(context);

  try {
    assertGrokConfigured();
    const response = await grokClient.responses.create({
      model: "grok-4.3",
      input: [
        {
          role: "system",
          content: [
            "You write a Monday weekly operations email for Josh at Party Perfect Event Rentals (Tulsa).",
            "Plain text only, no markdown. About 15–30 short lines.",
            "Sections: Snapshot, Hiring (flagged names if any), Priorities, Catch Up, Next actions.",
            "Use only facts from the JSON. Sign as Mike · Operations Manager.",
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
    if (text) body = text.slice(0, 4000);
  } catch {
    // fallback already set
  }

  return body;
}
