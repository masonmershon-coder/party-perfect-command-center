import {
  checkItemAvailability,
  getContract,
  getContractBalance,
  getCustomerBalances,
  getCustomerHistory,
  searchCustomers,
} from "./queries";
import {
  getCustomerHistory as getPgCustomerHistory,
  isPorDbConfigured,
  searchCustomers as searchPgCustomers,
} from "@/lib/por-db";
import { lookupInventory } from "@/lib/inventory-lookup";

export const POR_CRM_TOOL_NAMES = [
  "por_customer_history",
  "por_contract_balance",
  "por_availability",
  "lookup_inventory",
] as const;

export type PorCrmToolName = (typeof POR_CRM_TOOL_NAMES)[number];

export type PorCrmToolContext = {
  /** Owner session — dollar amounts allowed */
  financialAccess: boolean;
  /** Madison gets availability + non-dollar status only */
  agent: "mike" | "madison";
};

export const POR_CRM_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    name: "por_customer_history",
    description:
      "Look up a POR customer by customer number (CNUM) or name. Returns job sites, comments, recent contracts, and linked payments. PII is internal Command Center only.",
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Customer number or name search",
        },
        cnum: {
          type: "string",
          description: "Exact CustomerFile.CNUM when known",
        },
      },
    },
  },
  {
    type: "function" as const,
    name: "por_contract_balance",
    description:
      "Get contract totals, paid amount, balance (TOTL-PAID), and payment detail for a POR contract number (CNTR), or open balances for a customer.",
    parameters: {
      type: "object",
      properties: {
        cntr: { type: "string", description: "Transactions.CNTR" },
        cnum: { type: "string", description: "CustomerFile.CNUM for all balances" },
      },
    },
  },
  {
    type: "function" as const,
    name: "por_availability",
    description:
      "Check rental availability for an item (SKU / ItemFile.KEY or ItemFile.NUM) on a date. Uses live POR reservations (firm R/O vs soft Q).",
    parameters: {
      type: "object",
      properties: {
        item: {
          type: "string",
          description: "Item SKU (KEY) or NUM",
        },
        date: {
          type: "string",
          description: "ISO date YYYY-MM-DD",
        },
        qty: {
          type: "number",
          description: "Optional requested quantity",
        },
      },
      required: ["item", "date"],
    },
  },
  {
    type: "function" as const,
    name: "lookup_inventory",
    description:
      "Look up how many of a rental item are owned, out on rent, and available — by plain-English name (no SKU required). Use for questions like \"how many 8 flip tables are out?\" or \"how many gold chargers are available on Oct 12?\". Defaults date to today. Prefer this over the aggregate warehouse items-out total when the user names a specific item.",
    parameters: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description:
            'Plain-English item name, e.g. "8 flip table", "gold charger", "60 round"',
        },
        date: {
          type: "string",
          description:
            "Optional ISO date YYYY-MM-DD. Omit for today / \"right now\".",
        },
      },
      required: ["item_name"],
    },
  },
];

export async function executePorCrmTool(
  name: string,
  args: Record<string, unknown>,
  ctx: PorCrmToolContext,
): Promise<unknown> {
  const includeFinancials =
    ctx.financialAccess && ctx.agent === "mike";

  if (name === "por_customer_history") {
    const includeFinancials =
      ctx.financialAccess && ctx.agent === "mike";
    const cnum = String(args.cnum || "").trim();
    const q = String(args.q || "").trim();

    // Prefer Supabase Postgres mirror when DATABASE_URL is set.
    if (isPorDbConfigured()) {
      try {
        if (cnum) {
          const history = await getPgCustomerHistory(cnum, includeFinancials);
          if (!history) return { error: `No customer ${cnum}` };
          return formatPgHistoryForAgent(history, ctx);
        }
        if (!q) return { error: "Provide q or cnum" };
        const matches = await searchPgCustomers(q, 8);
        if (!matches.length) return { matches: [], message: "No customers found." };
        if (matches.length === 1) {
          const history = await getPgCustomerHistory(matches[0].key, includeFinancials);
          return history
            ? formatPgHistoryForAgent(history, ctx)
            : { matches };
        }
        return {
          matches: matches.map((m) => ({
            cnum: m.key,
            name: m.name,
            city: m.city,
            phone: ctx.agent === "mike" ? m.phone : undefined,
            email: ctx.agent === "mike" ? m.email : undefined,
            lastActive: m.lastActive,
          })),
          source: "supabase-por",
        };
      } catch (err) {
        // Fall through to Redis CRM if Postgres is down
        console.warn(
          "[por-crm] Postgres lookup failed; falling back to Redis:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (ctx.agent === "madison" && !ctx.financialAccess) {
      // Madison: name/status/contracts without dollars or deep PII dump
    }
    if (cnum) {
      const history = await getCustomerHistory(cnum, {
        includeFinancials,
        maxContracts: 25,
      });
      if (!history) return { error: `No customer ${cnum}` };
      return formatHistoryForAgent(history, ctx);
    }
    if (!q) return { error: "Provide q or cnum" };
    const matches = await searchCustomers(q, {
      limit: 8,
      includeFinancials,
    });
    if (!matches.length) return { matches: [], message: "No customers found." };
    if (matches.length === 1) {
      const history = await getCustomerHistory(matches[0].cnum, {
        includeFinancials,
        maxContracts: 25,
      });
      return history
        ? formatHistoryForAgent(history, ctx)
        : { matches };
    }
    return {
      matches: matches.map((m) => ({
        cnum: m.cnum,
        name: m.name,
        city: m.city,
        phone: ctx.agent === "mike" ? m.phone || m.mobile : undefined,
        email: ctx.agent === "mike" ? m.email : undefined,
        status: m.status,
        lastContract: m.lastContract,
        ...(includeFinancials
          ? { currentBalance: m.currentBalance }
          : {}),
      })),
      source: "redis-crm",
    };
  }

  if (name === "por_contract_balance") {
    if (!includeFinancials) {
      const cntr = String(args.cntr || "").trim();
      if (cntr) {
        const full = await getContract(cntr, { includeFinancials: false });
        if (!full) return { error: `No contract ${cntr}` };
        return {
          cntr,
          customerName: full.customerName,
          cusn: full.transaction.cusn,
          stat: full.transaction.stat,
          deliveryDate: full.transaction.deliveryDate,
          pickupDate: full.transaction.pickupDate,
          itemCount: full.items.length,
          note: "Dollar balances require Owner session.",
        };
      }
      return { error: "Owner access required for balances." };
    }

    const cntr = String(args.cntr || "").trim();
    const cnum = String(args.cnum || "").trim();
    if (cntr) {
      const bal = await getContractBalance(cntr, { includeFinancials: true });
      if (!bal) return { error: `No contract ${cntr}` };
      const full = await getContract(cntr, { includeFinancials: true });
      return {
        ...bal,
        items: full?.items.slice(0, 40),
        payments: full?.payments.slice(0, 20),
        paymentDetails: full?.paymentDetails.slice(0, 20),
      };
    }
    if (cnum) {
      return getCustomerBalances(cnum, {
        includeFinancials: true,
        openOnly: true,
      });
    }
    return { error: "Provide cntr or cnum" };
  }

  if (name === "por_availability") {
    const item = String(args.item || "").trim();
    const date = String(args.date || "").trim();
    if (!item || !date) return { error: "item and date required" };
    const avail = await checkItemAvailability(item, date);
    const qty = Number(args.qty);
    const requested = Number.isFinite(qty) && qty > 0 ? qty : undefined;
    return {
      ...avail,
      requested,
      overbooked:
        requested != null ? requested > avail.available : undefined,
    };
  }

  if (name === "lookup_inventory") {
    const itemName = String(
      args.item_name || args.itemName || args.q || args.item || "",
    ).trim();
    if (!itemName) return { error: "item_name required" };
    const dateRaw = String(args.date || "").trim() || undefined;
    const matches = await lookupInventory(itemName, dateRaw);
    if (!matches.length) {
      return {
        query: itemName,
        date: dateRaw || new Date().toISOString().slice(0, 10),
        matches: [],
        message: "No catalog matches for that item name.",
      };
    }
    return {
      query: itemName,
      date: matches[0].date,
      matches: matches.map((m) => ({
        name: m.name,
        sku: m.sku,
        category: m.category,
        total: m.total,
        out: m.outNow,
        softHeld: m.softHeld,
        available: m.available,
        date: m.date,
        spoken: `${m.total} total, ${m.outNow} out, ${m.available} available`,
      })),
      tip: "Answer naturally using spoken counts for the best match. Prefer this over the aggregate items-out number.",
    };
  }

  return { error: `Unknown tool ${name}` };
}

function formatHistoryForAgent(
  history: Awaited<ReturnType<typeof getCustomerHistory>>,
  ctx: PorCrmToolContext,
) {
  if (!history) return null;
  const includeFinancials = ctx.financialAccess && ctx.agent === "mike";
  const showPii = ctx.agent === "mike";

  return {
    source: "redis-crm",
    customer: {
      cnum: history.customer.cnum,
      name: history.customer.name,
      city: history.customer.city,
      status: history.customer.status,
      lastActive: history.customer.lastActive,
      lastContract: history.customer.lastContract,
      numberContracts: history.customer.numberContracts,
      ...(showPii
        ? {
            phone: history.customer.phone || history.customer.mobile,
            email: history.customer.email,
            address: history.customer.address,
          }
        : {}),
      ...(includeFinancials
        ? {
            currentBalance: history.customer.currentBalance,
            creditLimit: history.customer.creditLimit,
          }
        : {}),
    },
    jobSites: history.jobSites.slice(0, 10).map((s) => ({
      description: s.description,
      siteAddress: s.siteAddress,
      siteCity: s.siteCity,
      contactName: showPii ? s.contactName : undefined,
      contactPhone: showPii ? s.contactPhone : undefined,
    })),
    comments: showPii
      ? history.comments.slice(0, 5).map((c) => c.comments)
      : [],
    contracts: history.contracts.slice(0, 20).map((c) => ({
      cntr: c.cntr,
      date: c.date,
      stat: c.stat,
      deliveryDate: c.deliveryDate,
      pickupDate: c.pickupDate,
      contact: showPii ? c.contact : undefined,
      ...(includeFinancials
        ? { totl: c.totl, paid: c.paid, balance: c.balance }
        : {}),
    })),
    payments: includeFinancials
      ? history.payments.slice(0, 15).map((p) => ({
          payment: p.payment,
          date: p.date,
          amount: p.amount,
          meth: p.meth,
          refNo: p.refNo,
        }))
      : [],
  };
}

function formatPgHistoryForAgent(
  history: NonNullable<Awaited<ReturnType<typeof getPgCustomerHistory>>>,
  ctx: PorCrmToolContext,
) {
  const includeFinancials = ctx.financialAccess && ctx.agent === "mike";
  const showPii = ctx.agent === "mike";
  return {
    source: "supabase-por",
    customer: {
      cnum: history.customer.key,
      name: history.customer.name,
      company: history.customer.company,
      city: history.customer.city,
      numberContracts: history.customer.numberContracts,
      ...(showPii
        ? {
            phone: history.customer.phone,
            email: history.customer.email,
            address: history.customer.address,
          }
        : {}),
      ...(includeFinancials
        ? { currentBalance: history.customer.currentBalance }
        : {}),
    },
    contracts: history.contracts.slice(0, 20).map((c) => ({
      cntr: c.cntr,
      date: c.date,
      stat: c.status,
      statusDesc: c.statusDesc,
      eventEndDate: c.eventEndDate,
      deliveryCity: c.deliveryCity,
      ...(includeFinancials ? { totl: c.total, paid: c.paid } : {}),
    })),
    payments: includeFinancials
      ? (history.payments || []).slice(0, 15).map((p) => ({
          date: p.date,
          amount: p.amount,
          meth: p.method,
          cntr: p.cntr,
        }))
      : [],
    stats: history.stats,
  };
}

/**
 * Heuristic: pull live CRM context for a user message before/alongside the LLM.
 * Detects contract numbers, customer lookups, and availability asks.
 */
export async function resolvePorCrmContextForMessage(
  message: string,
  ctx: PorCrmToolContext,
): Promise<string> {
  const blocks: string[] = [];
  const text = message.trim();
  if (!text) return "";

  const cntrMatches = [
    ...text.matchAll(
      /\b(?:contract|cntr|ticket|#)\s*[:#]?\s*(\d{5,7})\b/gi,
    ),
  ].map((m) => m[1]);
  const bareCntrs = [...text.matchAll(/\b(\d{6})\b/g)].map((m) => m[1]);
  const cntrs = [...new Set([...cntrMatches, ...bareCntrs])].slice(0, 3);

  for (const cntr of cntrs) {
    try {
      const result = await executePorCrmTool(
        "por_contract_balance",
        { cntr },
        ctx,
      );
      blocks.push(
        `POR contract ${cntr}:\n${JSON.stringify(result, null, 0).slice(0, 3500)}`,
      );
    } catch {
      // ignore
    }
  }

  const availMatch = text.match(
    /\b(?:avail(?:ability|able)?|on hand|can we rent)\b[\s\S]{0,80}?(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  );
  const itemMatch = text.match(
    /\b(?:for|item|sku)\s+["']?([A-Za-z0-9][A-Za-z0-9 &\-/]{1,40})["']?/i,
  );
  if (availMatch && itemMatch) {
    const dateRaw = availMatch[1];
    let date = dateRaw;
    if (dateRaw.includes("/")) {
      const [a, b, c] = dateRaw.split("/");
      const y = c.length === 2 ? `20${c}` : c;
      date = `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    }
    try {
      const result = await executePorCrmTool(
        "por_availability",
        { item: itemMatch[1].trim(), date },
        ctx,
      );
      blocks.push(`POR availability:\n${JSON.stringify(result)}`);
    } catch {
      // ignore
    }
  }

  // Plain-English inventory: "how many 8 flip tables are out?" / "white chairs available?"
  // Also: "how many gold chargers are free on Oct 12?"
  const howMany =
    text.match(
      /\bhow many\s+(.+?)\s+(?:are\s+)?(?:(?:rented\s+)?out|available|left|on hand|on rent|free|do we have)\b/i,
    ) ||
    text.match(
      /\b(?:how many|what(?:'s| is) (?:our|the) (?:count|qty|quantity) (?:of|for))\s+(.+?)(?:\?|$)/i,
    );
  const inventoryCue =
    /\b(?:out(?: now)?|available|on hand|on rent|in stock|do we have|left|free)\b/i.test(
      text,
    ) || /\bhow many\b/i.test(text);
  if (howMany || (inventoryCue && !availMatch)) {
    let itemName = (howMany?.[1] || "").trim();
    if (!itemName) {
      // Fallback: strip common filler and take a short noun phrase
      itemName = text
        .replace(/\bhow many\b/gi, "")
        .replace(
          /\b(are|is|out|available|left|on hand|on rent|right now|today|do we have|we have|of our|of the)\b/gi,
          " ",
        )
        .replace(/[?!.]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
    }
    itemName = itemName
      .replace(/\b(right now|today|currently|as of .*)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    let dateArg: string | undefined;
    const dateInMsg = text.match(
      /\b(?:on|for)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i,
    );
    if (dateInMsg) {
      const dateRaw = dateInMsg[1];
      if (dateRaw.includes("/")) {
        const [a, b, c] = dateRaw.split("/");
        const y = c.length === 2 ? `20${c}` : c;
        dateArg = `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
      } else {
        dateArg = dateRaw;
      }
    }

    if (itemName.length >= 2) {
      try {
        const result = await executePorCrmTool(
          "lookup_inventory",
          { item_name: itemName, ...(dateArg ? { date: dateArg } : {}) },
          ctx,
        );
        blocks.push(
          `POR inventory lookup (prefer over aggregate items-out):\n${JSON.stringify(result)}`,
        );
      } catch {
        // ignore
      }
    }
  }

  const customerCue =
    /\b(?:customer|client|account|who is|look(?:\s*up)?)\b/i.test(text) ||
    /\bcnum\b/i.test(text);
  if (customerCue || /\bcustomer\s+#?\s*\d+/i.test(text)) {
    const cnumMatch = text.match(/\b(?:cnum|customer\s*#?)\s*[:#]?\s*(\d{3,})\b/i);
    const nameMatch = text.match(
      /\b(?:customer|client|account)\s+(?:named?\s+)?["']?([A-Za-z][A-Za-z .'-]{1,40})["']?/i,
    );
    try {
      const result = await executePorCrmTool(
        "por_customer_history",
        cnumMatch
          ? { cnum: cnumMatch[1] }
          : { q: nameMatch?.[1]?.trim() || text.slice(0, 80) },
        ctx,
      );
      blocks.push(
        `POR customer lookup:\n${JSON.stringify(result, null, 0).slice(0, 4000)}`,
      );
    } catch {
      // ignore
    }
  }

  if (!blocks.length) return "";
  return [
    "Live POR CRM tool results (read-only mirror — never invent writes to POR):",
    ...blocks,
  ].join("\n\n");
}
